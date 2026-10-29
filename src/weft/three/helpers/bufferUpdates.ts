import type { BufferAttribute, InstancedMesh } from 'three'

const trackedMeshes = new WeakSet<InstancedMesh>()

/** WebGPU copies instance attributes internally; retire ranges once the mesh was drawn. */
export function trackInstanceUploads(mesh: InstancedMesh): void {
  if (trackedMeshes.has(mesh)) return
  trackedMeshes.add(mesh)
  const afterRender = mesh.onAfterRender
  mesh.onAfterRender = function (...args) {
    mesh.instanceMatrix.clearUpdateRanges()
    mesh.instanceColor?.clearUpdateRanges()
    afterRender.apply(this, args)
  }
}

export function updateInstanceMatrices(mesh: InstancedMesh): void {
  trackInstanceUploads(mesh)
  updateActiveAttribute(mesh.instanceMatrix, mesh.count)
}

/** Upload the live prefix, rather than the full capacity of a pooled instance buffer. */
export function updateActiveAttribute(buffer: BufferAttribute, count: number): void {
  updateAttributeSpan(buffer, 0, count)
}

export function updateAttributeSpan(buffer: BufferAttribute, start: number, count: number): void {
  const offset = Math.max(0, start) * buffer.itemSize
  const components = Math.min(buffer.array.length - offset, Math.max(0, count) * buffer.itemSize)
  // Keep pending ranges: callers can update more than once before a render.
  if (components > 0) {
    const pending = buffer.updateRanges.find((range) => range.start <= offset + components && range.start + range.count >= offset)
    if (pending) {
      const end = Math.max(pending.start + pending.count, offset + components)
      pending.start = Math.min(pending.start, offset)
      pending.count = end - pending.start
    } else buffer.addUpdateRange(offset, components)
    buffer.needsUpdate = true
  }
}
