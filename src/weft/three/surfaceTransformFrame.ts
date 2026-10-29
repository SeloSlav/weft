import * as THREE from 'three'
import { updateInstanceMatrices } from './helpers/bufferUpdates'

/** JSON-safe bit patterns. Order is root-first depth-first, including non-mesh ancestors. */
export type SurfaceTransformFrame = {
  version: 1
  tick: number
  nodes: Array<{
    type: string
    name: string
    children: number
    visible: boolean
    matrixBits: number[]
    poseBits: number[]
    instances?: { count: number; matrixBits: number[] }
  }>
}

export function encodeDoubles(values: readonly number[]): number[] {
  const view = new DataView(new ArrayBuffer(8))
  const bits: number[] = []
  for (const value of values) {
    view.setFloat64(0, value, false)
    bits.push(view.getUint32(0, false), view.getUint32(4, false))
  }
  return bits
}
export function decodeDoubles(bits: readonly number[]): number[] {
  const view = new DataView(new ArrayBuffer(8))
  const values: number[] = []
  for (let i = 0; i < bits.length; i += 2) {
    view.setUint32(0, bits[i]!, false); view.setUint32(4, bits[i + 1]!, false)
    values.push(view.getFloat64(0, false))
  }
  return values
}
export function validBits(bits: unknown, length: number): bits is number[] {
  if (!Array.isArray(bits) || bits.length !== length) return false
  for (let i = 0; i < length; i++) {
    const value = bits[i]
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) return false
  }
  return true
}
export function nodesOf(root: THREE.Object3D): THREE.Object3D[] {
  const nodes: THREE.Object3D[] = []
  root.traverse(node => nodes.push(node))
  return nodes
}
function matrixWords(mesh: THREE.InstancedMesh, count: number): Uint32Array {
  const array = mesh.instanceMatrix.array
  if (!(array instanceof Float32Array)) throw new TypeError('Instance matrices must use Float32Array')
  return new Uint32Array(array.buffer, array.byteOffset, count * 16)
}

/** Capture current local transforms and live instance matrices. Does not advance the effect. */
export function captureSurfaceTransformFrame(root: THREE.Object3D, tick: number): SurfaceTransformFrame {
  if (!Number.isSafeInteger(tick) || tick < 0) throw new RangeError('Frame tick must be a non-negative safe integer')
  const nodes = nodesOf(root).map(node => {
    if (node.matrixAutoUpdate) node.updateMatrix()
    const pose = [...node.position.toArray(), ...node.quaternion.toArray(), ...node.scale.toArray()]
    const entry: SurfaceTransformFrame['nodes'][number] = { type: node.type, name: node.name, children: node.children.length,
      visible: node.visible, matrixBits: encodeDoubles(node.matrix.elements), poseBits: encodeDoubles(pose) }
    if ((node as THREE.InstancedMesh).isInstancedMesh) {
      const mesh = node as THREE.InstancedMesh
      if (!Number.isSafeInteger(mesh.count) || mesh.count < 0 || mesh.count > mesh.instanceMatrix.count) {
        throw new RangeError('Invalid instance count')
      }
      entry.instances = { count: mesh.count, matrixBits: Array.from(matrixWords(mesh, mesh.count)) }
    }
    return entry
  })
  return { version: 1, tick, nodes }
}

/** Internal validation is shared with animation frames to avoid partial application. */
export function validateSurfaceTransformFrame(root: THREE.Object3D, frame: SurfaceTransformFrame): THREE.Object3D[] {
  if (!frame || frame.version !== 1 || !Number.isSafeInteger(frame.tick) || frame.tick < 0 || !Array.isArray(frame.nodes)) {
    throw new TypeError('Invalid surface transform frame')
  }
  const nodes = nodesOf(root)
  if (nodes.length !== frame.nodes.length) throw new Error('Surface transform frame hierarchy differs')
  // Validate the entire frame before mutating any scene state.
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!, entry = frame.nodes[i]!
    const mesh = (node as THREE.InstancedMesh).isInstancedMesh ? node as THREE.InstancedMesh : undefined
    if (!entry || entry.type !== node.type || entry.name !== node.name || entry.children !== node.children.length || typeof entry.visible !== 'boolean' ||
      !validBits(entry.matrixBits, 32) || !validBits(entry.poseBits, 20) || Boolean(entry.instances) !== Boolean(mesh)) {
      throw new Error(`Surface transform frame node ${i} is incompatible`)
    }
    if (mesh && entry.instances) {
      const { count, matrixBits } = entry.instances
      if (!Number.isSafeInteger(count) || count < 0 || count > mesh.instanceMatrix.count || !validBits(matrixBits, count * 16)) {
        throw new Error(`Surface transform frame instance buffer ${i} is incompatible`)
      }
      matrixWords(mesh, count)
    }
  }
  return nodes
}

/** Apply a validated frame to an identically structured replica. No simulation is run on the replica. */
export function applySurfaceTransformFrame(root: THREE.Object3D, frame: SurfaceTransformFrame): void {
  const nodes = validateSurfaceTransformFrame(root, frame)
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!, entry = frame.nodes[i]!
    const pose = decodeDoubles(entry.poseBits)
    node.position.fromArray(pose, 0); node.quaternion.fromArray(pose, 3); node.scale.fromArray(pose, 7)
    node.matrix.fromArray(decodeDoubles(entry.matrixBits))
    node.matrixAutoUpdate = false
    node.matrixWorldNeedsUpdate = true
    node.visible = entry.visible
    if (entry.instances) {
      const mesh = node as THREE.InstancedMesh
      matrixWords(mesh, entry.instances.count).set(entry.instances.matrixBits)
      mesh.count = entry.instances.count
      mesh.boundingBox = null
      mesh.boundingSphere = null
      updateInstanceMatrices(mesh)
    }
  }
}
