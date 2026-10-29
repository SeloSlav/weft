import * as THREE from 'three'
import { trackInstanceUploads, updateAttributeSpan } from './bufferUpdates'

type Region = { x: number; z: number; radius: number }
type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number }
type Entry = { matrix: Float32Array; color: Float32Array; extra?: Float32Array; count: number; start: number; bounds: Bounds }
const emptyBounds = (): Bounds => ({ minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity })

/** Persistent per-line output for projectors whose reactions can compact instance buffers. */
export class LineOutputCache {
  private readonly entries = new Map<number, Entry>()
  private previousRegions: Region[] = []
  private regions: Region[] = []
  private dependency: readonly unknown[] = []
  private bounds = emptyBounds()
  private first = Infinity
  private last = -1
  private previousCount = 0
  private projected = 0
  private replayed = 0
  private mesh!: THREE.InstancedMesh
  private extra?: THREE.InstancedBufferAttribute
  private forced = false

  clear(): void { this.entries.clear(); this.previousRegions = []; this.regions = []; this.dependency = []; this.previousCount = 0 }
  getStats() { return { projectedLines: this.projected, replayedLines: this.replayed, cachedLines: this.entries.size } }
  begin(mesh: THREE.InstancedMesh, extra: THREE.InstancedBufferAttribute | undefined,
    dependencies: readonly unknown[], regions: readonly Region[], force = false): void {
    if (dependencies.length !== this.dependency.length || dependencies.some((v, i) => !Object.is(v, this.dependency[i])) ||
      this.previousCount >= mesh.instanceMatrix.count) this.clear()
    this.dependency = dependencies.slice()
    this.mesh = mesh; this.extra = extra; this.first = Infinity; this.last = -1; this.forced = force
    this.regions = [...this.previousRegions, ...regions]
    this.previousRegions = regions.map(r => ({ ...r }))
    trackInstanceUploads(mesh)
  }
  note(x: number, z: number): void {
    this.bounds.minX = Math.min(this.bounds.minX, x); this.bounds.maxX = Math.max(this.bounds.maxX, x)
    this.bounds.minZ = Math.min(this.bounds.minZ, z); this.bounds.maxZ = Math.max(this.bounds.maxZ, z)
  }
  private affected(bounds: Bounds): boolean {
    for (const r of this.regions) {
      const radius = Math.abs(r.radius)
      if (!Number.isFinite(radius) || !Number.isFinite(r.x) || !Number.isFinite(r.z)) return true
      if (r.x + radius >= bounds.minX && r.x - radius <= bounds.maxX &&
        r.z + radius >= bounds.minZ && r.z - radius <= bounds.maxZ) return true
    }
    return false
  }
  visit(key: number, start: number, project: () => number, force = false): number {
    const previous = this.entries.get(key), capacity = this.mesh.instanceMatrix.count
    if (previous && !force && !this.forced && !this.affected(previous.bounds) && start + previous.count < capacity) {
      if (previous.start !== start) {
        ;(this.mesh.instanceMatrix.array as Float32Array).set(previous.matrix, start * 16)
        if (this.mesh.instanceColor) (this.mesh.instanceColor.array as Float32Array).set(previous.color, start * 3)
        if (this.extra && previous.extra) (this.extra.array as Float32Array).set(previous.extra, start)
        this.changed(start, previous.count)
      }
      previous.start = start; this.replayed++
      return start + previous.count
    }
    this.bounds = emptyBounds()
    const end = project(), count = end - start
    const matrix = (this.mesh.instanceMatrix.array as Float32Array).slice(start * 16, end * 16)
    const color = this.mesh.instanceColor ? (this.mesh.instanceColor.array as Float32Array).slice(start * 3, end * 3) : new Float32Array(0)
    const extra = this.extra ? (this.extra.array as Float32Array).slice(start, end) : undefined
    this.entries.set(key, { matrix, color, extra, count, start, bounds: this.bounds })
    this.changed(start, count); this.projected++
    return end
  }
  private changed(start: number, count: number): void {
    if (count <= 0) return
    this.first = Math.min(this.first, start); this.last = Math.max(this.last, start + count)
  }
  finish(count: number): void {
    this.mesh.count = count; this.previousCount = count
    if (this.last > this.first) {
      updateAttributeSpan(this.mesh.instanceMatrix, this.first, this.last - this.first)
      if (this.mesh.instanceColor) updateAttributeSpan(this.mesh.instanceColor, this.first, this.last - this.first)
      if (this.extra) this.extra.needsUpdate = true
    }
  }
}
