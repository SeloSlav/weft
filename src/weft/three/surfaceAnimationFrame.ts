import * as THREE from 'three'
import { updateAttributeSpan } from './helpers/bufferUpdates'
import { applySurfaceTransformFrame, captureSurfaceTransformFrameWords, decodeDoubles, encodeDoubles,
  nodesOf, validBits, validateSurfaceTransformFrame, type SurfaceFrameWords, type SurfaceTransformFrame } from './surfaceTransformFrame'

export type SurfaceAnimationUniforms = Record<string, number | readonly number[]>
export type SurfaceAnimationTarget = {
  readonly group: THREE.Object3D
  getAnimationUniforms?: () => SurfaceAnimationUniforms
  validateAnimationUniforms?: (uniforms: SurfaceAnimationUniforms) => void
  setAnimationUniforms?: (uniforms: SurfaceAnimationUniforms) => void
}
type AttributeFrame = { name: string; itemSize: number; normalized: boolean; instanced: boolean; meshPerAttribute: number; words: SurfaceFrameWords }
type UniformFrame = { name: string; scalar: boolean; bits: number[] }
export type SurfaceAnimationFrame = {
  version: 1
  transform: SurfaceTransformFrame
  nodes: Array<null | { attributes: AttributeFrame[]; instanceColor: SurfaceFrameWords | null }>
  uniforms: UniformFrame[]
}

type FloatAttribute = THREE.BufferAttribute | THREE.InstancedBufferAttribute
function attributeWords(attribute: FloatAttribute, components: number): Uint32Array {
  if (!(attribute.array instanceof Float32Array)) throw new TypeError('Animation frames require non-interleaved Float32 buffer attributes')
  return new Uint32Array(attribute.array.buffer, attribute.array.byteOffset, components)
}
function meshAttribute(node: THREE.Object3D): THREE.Mesh | null {
  return (node as THREE.Mesh).isMesh ? node as THREE.Mesh : null
}
function componentCount(attribute: FloatAttribute, mesh: THREE.Mesh, count: number): number {
  const instanced = (attribute as THREE.InstancedBufferAttribute).isInstancedBufferAttribute
  if (!instanced) return attribute.array.length
  if (!(mesh as THREE.InstancedMesh).isInstancedMesh) throw new Error('Instanced geometry attribute requires an InstancedMesh')
  const divisor = (attribute as THREE.InstancedBufferAttribute).meshPerAttribute
  if (!Number.isSafeInteger(divisor) || divisor <= 0) throw new RangeError('Invalid instanced attribute divisor')
  return Math.ceil(count / divisor) * attribute.itemSize
}
function describeAttribute(mesh: THREE.Mesh, name: string, count: number) {
  const value=mesh.geometry.getAttribute(name)
  if (!value || (value as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) throw new TypeError('Animation frames require non-interleaved attributes')
  const attribute=value as FloatAttribute
  const components=componentCount(attribute,mesh,count)
  if (components > attribute.array.length) throw new RangeError(`Animation attribute ${name} is too small`)
  const instanced=Boolean((attribute as THREE.InstancedBufferAttribute).isInstancedBufferAttribute)
  const words=attributeWords(attribute,components)
  return { attribute, words, name, itemSize:attribute.itemSize, normalized:attribute.normalized, instanced,
    meshPerAttribute:instanced ? (attribute as THREE.InstancedBufferAttribute).meshPerAttribute : 1 }
}
function attributesFor(mesh: THREE.Mesh, count: number, copy: boolean): AttributeFrame[] {
  if (!(mesh.geometry as THREE.BufferGeometry)?.isBufferGeometry) throw new TypeError('Animation frames require BufferGeometry')
  if ((mesh as THREE.SkinnedMesh).isSkinnedMesh || Object.values(mesh.geometry.morphAttributes).some(attributes => attributes.length > 0)) {
    throw new TypeError('Animation frames do not support skinned meshes or morph attributes')
  }
  return Object.keys(mesh.geometry.attributes).sort().map(name=>{
    const {attribute:_,words,...data}=describeAttribute(mesh,name,count)
    return {...data,words:copy ? Array.from(words) : words}
  })
}
function readUniforms(target: SurfaceAnimationTarget): UniformFrame[] {
  const values=target.getAnimationUniforms?.() ?? {}
  return Object.keys(values).sort().map(name=>{
    const value=values[name]!, scalar=typeof value==='number'
    if (!scalar && !Array.isArray(value)) throw new TypeError(`Animation uniform ${name} must be a number or number array`)
    const numbers=scalar ? [value as number] : value as readonly number[]
    if (!numbers.every(Number.isFinite)) throw new RangeError(`Animation uniform ${name} must be finite`)
    return {name,scalar,bits:encodeDoubles(numbers)}
  })
}

/** Captures transforms, geometry attributes, instance colors and explicitly exposed animation uniforms. */
export function captureSurfaceAnimationFrame(target: SurfaceAnimationTarget, tick: number): SurfaceAnimationFrame {
  return captureSurfaceAnimationFrameWords(target,tick,true)
}

/** Internal zero-copy variant; consumers must copy its buffer views before returning. */
export function captureSurfaceAnimationFrameWords(target: SurfaceAnimationTarget, tick: number, copy: boolean): SurfaceAnimationFrame {
  const transform=captureSurfaceTransformFrameWords(target.group,tick,copy)
  const nodes=nodesOf(target.group).map(node=>{
    const mesh=meshAttribute(node)
    if (!mesh) return null
    const instanced=(mesh as THREE.InstancedMesh).isInstancedMesh ? mesh as THREE.InstancedMesh : null
    const count=instanced?.count ?? 0
    const color=instanced?.instanceColor
    if (color && (color.itemSize!==3 || color.normalized || color.count<count)) throw new Error('Unsupported instance color attribute')
    const colorWords=color ? attributeWords(color,count*3) : null
    return {attributes:attributesFor(mesh,count,copy),instanceColor:colorWords ? (copy ? Array.from(colorWords) : colorWords) : null}
  })
  return {version:1,transform,nodes,uniforms:readUniforms(target)}
}

/** Validates the complete frame before applying it. Replica effects must not run their own updates. */
export function applySurfaceAnimationFrame(target: SurfaceAnimationTarget, frame: SurfaceAnimationFrame): void {
  if (!frame || frame.version!==1 || !Array.isArray(frame.nodes) || !Array.isArray(frame.uniforms)) throw new TypeError('Invalid surface animation frame')
  const nodes=validateSurfaceTransformFrame(target.group,frame.transform)
  if (nodes.length!==frame.nodes.length) throw new Error('Animation frame hierarchy differs')
  const expectedUniforms=readUniforms(target)
  if (expectedUniforms.length!==frame.uniforms.length || (frame.uniforms.length>0 && !target.setAnimationUniforms)) throw new Error('Animation uniform schema differs')
  const decoded: Record<string,number|number[]> = Object.create(null)
  for(let i=0;i<expectedUniforms.length;i++){
    const expected=expectedUniforms[i]!, actual=frame.uniforms[i]!
    if (!actual || actual.name!==expected.name || actual.scalar!==expected.scalar || !validBits(actual.bits,expected.bits.length)) throw new Error('Animation uniform schema differs')
    const values=decodeDoubles(actual.bits)
    if (!values.every(Number.isFinite)) throw new Error('Animation uniform must be finite')
    decoded[actual.name]=actual.scalar ? values[0]! : values
  }
  target.validateAnimationUniforms?.(decoded)
  for(let i=0;i<nodes.length;i++){
    const mesh=meshAttribute(nodes[i]!), saved=frame.nodes[i]
    if (!mesh) {if(saved!==null) throw new Error(`Animation node ${i} is incompatible`);continue}
    if (!saved || !Array.isArray(saved.attributes)) throw new Error(`Animation node ${i} is incompatible`)
    const instanced=(mesh as THREE.InstancedMesh).isInstancedMesh ? mesh as THREE.InstancedMesh : null
    const count=frame.transform.nodes[i]!.instances?.count ?? 0
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh || Object.values(mesh.geometry.morphAttributes).some(attributes => attributes.length > 0)) {
      throw new TypeError('Animation frames do not support skinned meshes or morph attributes')
    }
    const names=Object.keys(mesh.geometry.attributes).sort()
    if(names.length!==saved.attributes.length)throw new Error(`Animation node ${i} attributes differ`)
    for(let j=0;j<names.length;j++){
      const a=describeAttribute(mesh,names[j]!,count),b=saved.attributes[j]
      if(!b || a.name!==b.name || a.itemSize!==b.itemSize || a.normalized!==b.normalized ||
        a.instanced!==b.instanced || a.meshPerAttribute!==b.meshPerAttribute || !validBits(b.words,a.words.length)) {
        throw new Error(`Animation node ${i} attribute ${a.name} differs`)
      }
    }
    if (saved.instanceColor!==null) {
      if (!instanced || !validBits(saved.instanceColor,count*3)) throw new Error(`Animation node ${i} color differs`)
      if (instanced.instanceColor) {
        if (instanced.instanceColor.itemSize!==3 || instanced.instanceColor.normalized || instanced.instanceColor.count<count) throw new Error('Replica color buffer is incompatible')
        attributeWords(instanced.instanceColor,count*3)
      }
    }
  }
  applySurfaceTransformFrame(target.group,frame.transform)
  for(let i=0;i<nodes.length;i++){
    const mesh=meshAttribute(nodes[i]!),saved=frame.nodes[i]
    if(!mesh || !saved)continue
    for(const data of saved.attributes){
      const attribute=mesh.geometry.getAttribute(data.name) as FloatAttribute
      attributeWords(attribute,data.words.length).set(data.words)
      updateAttributeSpan(attribute,0,data.words.length/attribute.itemSize)
    }
    mesh.geometry.boundingBox=null;mesh.geometry.boundingSphere=null
    const instanced=(mesh as THREE.InstancedMesh).isInstancedMesh ? mesh as THREE.InstancedMesh : null
    if(instanced){
      const hadColor=Boolean(instanced.instanceColor)
      if(saved.instanceColor===null) instanced.instanceColor=null
      else {
        if(!instanced.instanceColor)instanced.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(instanced.instanceMatrix.count*3),3)
        attributeWords(instanced.instanceColor,saved.instanceColor.length).set(saved.instanceColor)
        updateAttributeSpan(instanced.instanceColor,0,saved.instanceColor.length/3)
      }
      if(hadColor!==Boolean(instanced.instanceColor))for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])material.needsUpdate=true
    }
  }
  if(frame.uniforms.length)target.setAnimationUniforms!(decoded)
}
