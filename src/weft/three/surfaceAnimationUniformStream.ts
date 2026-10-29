import * as THREE from 'three'
import { captureSurfaceAnimationBinary, applySurfaceAnimationBinary } from './surfaceAnimationBinary'
import { readUniforms, type SurfaceAnimationTarget, type UniformFrame } from './surfaceAnimationFrame'
import { decodeDoubles, nodesOf, validBits } from './surfaceTransformFrame'

const MAGIC=[0x57,0x55,0x53,0x31] as const // WUS1
const HEADER=68, HASH=32, MAX_PACKET=1024*1024
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true})

/** The stream must be replaced with a new keyframe when tracked render state changes. */
export class SurfaceAnimationKeyframeRequiredError extends Error {
  constructor(message='Animation state changed; create a new uniform stream and keyframe') {super(message);this.name='SurfaceAnimationKeyframeRequiredError'}
}
export function assertBytes(bytes:Uint8Array):void {
  if(!(bytes instanceof Uint8Array) || (typeof SharedArrayBuffer!=='undefined' && bytes.buffer instanceof SharedArrayBuffer)) throw new TypeError('Uniform stream packets must be non-shared Uint8Array data')
}
export async function digest(bytes:Uint8Array):Promise<Uint8Array> {
  if(!globalThis.crypto?.subtle)throw new Error('Uniform streams require Web Crypto SHA-256 in a secure context')
  return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes as Uint8Array<ArrayBuffer>))
}
export function equal(a:Uint8Array,b:Uint8Array):boolean {let mismatch=a.length^b.length;for(let i=0;i<Math.min(a.length,b.length);i++)mismatch|=a[i]!^b[i]!;return mismatch===0}
export function tickOf(frame:Uint8Array):number {
  assertBytes(frame)
  if(frame.length<8 || frame[0]!==87 || frame[1]!==70 || frame[2]!==65 || frame[3]!==49)throw new TypeError('Expected a WFA1 keyframe')
  const length=new DataView(frame.buffer,frame.byteOffset,frame.byteLength).getUint32(4,true)
  if(8+length>frame.length)throw new RangeError('Truncated WFA1 keyframe')
  const tick=JSON.parse(decoder.decode(frame.subarray(8,8+length)))?.transform?.tick
  if(!Number.isSafeInteger(tick) || tick<0)throw new RangeError('Invalid keyframe tick')
  return tick
}
// BufferAttribute.version is Three.js's write revision. Direct array mutations
// must be followed by needsUpdate = true, exactly as for GPU uploads.
function renderState(target:SurfaceAnimationTarget):unknown[] {
  const state:unknown[]=[]
  for(const node of nodesOf(target.group)){
    state.push(node,node.type,node.name,node.visible,node.children.length,node.matrixAutoUpdate,
      ...node.matrix.elements,...node.position.toArray(),...node.quaternion.toArray(),...node.scale.toArray())
    const mesh=node as THREE.InstancedMesh
    if(mesh.isInstancedMesh)state.push(mesh.count,mesh.instanceMatrix,mesh.instanceMatrix.array,mesh.instanceMatrix.version,
      mesh.instanceMatrix.itemSize,mesh.instanceMatrix.normalized,mesh.instanceColor,mesh.instanceColor?.array,
      mesh.instanceColor?.version,mesh.instanceColor?.itemSize,mesh.instanceColor?.normalized)
    const object=node as THREE.Mesh
    if(!object.isMesh)continue
    const geometry=object.geometry
    if(!geometry?.isBufferGeometry)throw new SurfaceAnimationKeyframeRequiredError('Uniform streams require BufferGeometry')
    if((object as THREE.SkinnedMesh).isSkinnedMesh || Object.values(geometry.morphAttributes).some(a=>a.length>0))throw new SurfaceAnimationKeyframeRequiredError('Uniform streams do not support skinned meshes or morph attributes')
    state.push(geometry,geometry.index,geometry.index?.array,geometry.index?.version)
    const names=Object.keys(geometry.attributes).sort();state.push(names.length)
    for(const name of names){
      const attr=geometry.attributes[name]!
      if((attr as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute)throw new SurfaceAnimationKeyframeRequiredError('Uniform streams do not support interleaved attributes')
      const attribute=attr as THREE.InstancedBufferAttribute
      if(!(attribute.array instanceof Float32Array))throw new SurfaceAnimationKeyframeRequiredError('Uniform streams require Float32 geometry attributes')
      state.push(name,attribute,attribute.array,attribute.version,attribute.itemSize,attribute.normalized,
        Boolean(attribute.isInstancedBufferAttribute),attribute.meshPerAttribute)
    }
  }
  return state
}
function unchanged(a:unknown[],b:unknown[]):boolean {return a.length===b.length && a.every((v,i)=>Object.is(v,b[i]))}
export function sameSchema(a:UniformFrame[],b:UniformFrame[]):boolean {
  return a.length===b.length && a.every((u,i)=>u.name===b[i]?.name && u.scalar===b[i]?.scalar && u.bits.length===b[i]?.bits.length)
}
export function decodeUniforms(actual:unknown,expected:UniformFrame[]):Record<string,number|number[]> {
  if(!Array.isArray(actual) || actual.length!==expected.length)throw new Error('Uniform stream schema differs')
  const values:Record<string,number|number[]>=Object.create(null)
  for(let i=0;i<expected.length;i++){
    const a=actual[i],b=expected[i]!
    if(!a || a.name!==b.name || a.scalar!==b.scalar || !validBits(a.bits,b.bits.length))throw new Error('Uniform stream schema differs')
    const numbers=decodeDoubles(a.bits)
    if(!numbers.every(Number.isFinite))throw new Error('Uniform stream values must be finite')
    values[a.name]=a.scalar ? numbers[0]! : numbers
  }
  return values
}

/** Fast path for absolute uniform updates while all tracked geometry and transforms stay unchanged. */
export class SurfaceAnimationUniformEncoder {
  private sequence=0
  private busy=false
  constructor(privateTarget:SurfaceAnimationTarget, privateHash:Uint8Array, privateId:Uint8Array, privateState:unknown[],
    privateSchema:UniformFrame[], initialTick:number) {
    this.target=privateTarget;this.baseHash=privateHash;this.streamId=privateId;this.state=privateState;this.schema=privateSchema;this.lastTick=initialTick
  }
  private readonly target:SurfaceAnimationTarget
  private readonly baseHash:Uint8Array
  private readonly streamId:Uint8Array
  private readonly state:unknown[]
  private readonly schema:UniformFrame[]
  private lastTick:number

  async capture(tick:number):Promise<Uint8Array> {
    if(this.busy)throw new Error('Uniform stream capture is already in progress')
    if(!Number.isSafeInteger(tick) || tick<=this.lastTick)throw new RangeError('Uniform stream ticks must increase')
    if(this.sequence===0xffffffff)throw new SurfaceAnimationKeyframeRequiredError('Uniform stream sequence exhausted')
    if(!unchanged(this.state,renderState(this.target)))throw new SurfaceAnimationKeyframeRequiredError()
    const uniforms=readUniforms(this.target)
    if(!unchanged(this.state,renderState(this.target)))throw new SurfaceAnimationKeyframeRequiredError()
    if(!sameSchema(this.schema,uniforms))throw new SurfaceAnimationKeyframeRequiredError('Animation uniform schema changed')
    const payload=encoder.encode(JSON.stringify(uniforms))
    if(HEADER+payload.length+HASH>MAX_PACKET)throw new RangeError('Uniform stream packet exceeds 1 MiB')
    const packet=new Uint8Array(HEADER+payload.length+HASH),view=new DataView(packet.buffer)
    packet.set(MAGIC);view.setUint32(4,this.sequence+1,true);view.setFloat64(8,tick,true)
    packet.set(this.baseHash,16);packet.set(this.streamId,48);view.setUint32(64,payload.length,true);packet.set(payload,HEADER)
    this.busy=true
    try {
      const checksum=await digest(packet.subarray(0,HEADER+payload.length))
      packet.set(checksum,HEADER+payload.length);this.sequence++;this.lastTick=tick
      return packet
    } finally {this.busy=false}
  }
}

/** Absolute uniform packets can skip lost packets; stale or wrong-keyframe packets are rejected. */
export class SurfaceAnimationUniformDecoder {
  private sequence=0
  private busy=false
  constructor(privateTarget:SurfaceAnimationTarget,privateHash:Uint8Array,privateId:Uint8Array,privateState:unknown[],
    privateSchema:UniformFrame[],initialTick:number){
    this.target=privateTarget;this.baseHash=privateHash;this.streamId=privateId;this.state=privateState;this.schema=privateSchema;this.lastTick=initialTick
  }
  private readonly target:SurfaceAnimationTarget
  private readonly baseHash:Uint8Array
  private readonly streamId:Uint8Array
  private readonly state:unknown[]
  private readonly schema:UniformFrame[]
  private lastTick:number

  async apply(input:Uint8Array):Promise<number> {
    if(this.busy)throw new Error('Uniform stream apply is already in progress')
    assertBytes(input)
    if(input.length<HEADER+HASH || input.length>MAX_PACKET || MAGIC.some((value,i)=>input[i]!==value))throw new TypeError('Invalid uniform stream packet')
    // Packets are small; snapshot before awaiting to prevent caller mutation.
    const packet=new Uint8Array(input),view=new DataView(packet.buffer)
    const sequence=view.getUint32(4,true),tick=view.getFloat64(8,true),length=view.getUint32(64,true)
    if(!sequence || sequence<=this.sequence || !Number.isSafeInteger(tick) || tick<=this.lastTick)throw new Error('Stale or invalid uniform stream packet')
    if(!equal(packet.subarray(16,48),this.baseHash))throw new Error('Uniform stream keyframe differs')
    if(!equal(packet.subarray(48,64),this.streamId))throw new Error('Uniform stream identity differs')
    if(HEADER+length+HASH!==packet.length)throw new RangeError('Invalid uniform stream packet length')
    const values=decodeUniforms(JSON.parse(decoder.decode(packet.subarray(HEADER,HEADER+length))),this.schema)
    if(!this.target.setAnimationUniforms)throw new Error('Uniform stream target cannot apply uniforms')
    if(!unchanged(this.state,renderState(this.target)))throw new SurfaceAnimationKeyframeRequiredError('Replica render state changed')
    this.busy=true
    try {
      if(!equal(await digest(packet.subarray(0,HEADER+length)),packet.subarray(HEADER+length)))throw new Error('Uniform stream packet hash differs')
      // State can be changed by another task while the digest is in flight.
      if(!unchanged(this.state,renderState(this.target)))throw new SurfaceAnimationKeyframeRequiredError('Replica render state changed')
      this.target.validateAnimationUniforms?.(values)
      this.target.setAnimationUniforms(values)
      this.sequence=sequence;this.lastTick=tick
      return tick
    } finally {this.busy=false}
  }
}

/** Capture an initial full keyframe; acknowledge its delivery before sending uniform packets. */
export async function createSurfaceAnimationUniformEncoder(target:SurfaceAnimationTarget,tick:number):Promise<{keyframe:Uint8Array;streamId:Uint8Array;encoder:SurfaceAnimationUniformEncoder}> {
  if(!target.getAnimationUniforms)throw new Error('Uniform stream target must expose animation uniforms')
  if(!globalThis.crypto?.getRandomValues)throw new Error('Uniform streams require Web Crypto in a secure context')
  const streamId=globalThis.crypto.getRandomValues(new Uint8Array(16))
  const keyframe=captureSurfaceAnimationBinary(target,tick),state=renderState(target),schema=readUniforms(target)
  const hash=await digest(keyframe)
  return {keyframe,streamId,encoder:new SurfaceAnimationUniformEncoder(target,hash,new Uint8Array(streamId),state,schema,tick)}
}

/** Apply an initial WFA1 keyframe and create a decoder bound to its exact bytes. */
export async function createSurfaceAnimationUniformDecoder(target:SurfaceAnimationTarget,keyframe:Uint8Array,streamId:Uint8Array,
  options:{ maxFrameBytes?:number } = {}):Promise<SurfaceAnimationUniformDecoder> {
  assertBytes(keyframe)
  assertBytes(streamId)
  if(streamId.length!==16)throw new RangeError('Uniform stream identity must be 16 bytes')
  const limit=options.maxFrameBytes ?? 256*1024*1024
  if(!Number.isSafeInteger(limit) || limit<0)throw new RangeError('maxFrameBytes must be a non-negative safe integer')
  if(keyframe.length>limit)throw new RangeError('Uniform stream keyframe exceeds maxFrameBytes')
  if(!target.getAnimationUniforms || !target.setAnimationUniforms)throw new Error('Uniform stream target must expose and apply animation uniforms')
  const owned=new Uint8Array(keyframe),id=new Uint8Array(streamId),tick=tickOf(owned),hash=await digest(owned)
  applySurfaceAnimationBinary(target,owned)
  return new SurfaceAnimationUniformDecoder(target,hash,id,renderState(target),readUniforms(target),tick)
}
