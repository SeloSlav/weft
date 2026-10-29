/** Reusable, allocation-light deduplication for dense, stable integer identities. */
export class SpatialCandidateSet {
  private readonly marks: Uint32Array
  private generation = 1
  readonly values: number[] = []

  constructor(capacity: number) { this.marks = new Uint32Array(capacity) }
  reset(): void {
    this.values.length = 0
    this.generation = (this.generation + 1) >>> 0
    if (this.generation === 0) { this.marks.fill(0); this.generation = 1 }
  }
  has(index: number): boolean { return this.marks[index] === this.generation }
  add(index: number): void {
    if (!Number.isSafeInteger(index) || index < 0 || index >= this.marks.length) throw new RangeError('Candidate index is out of bounds')
    if (this.has(index)) return
    this.marks[index] = this.generation
    this.values.push(index)
  }
}

/** Immutable-between-rebuilds point grid. Results are borrowed until the next query or rebuild
 * and retain original placement order. Rebuild after changing point positions.
 */
export class SpatialPointIndex {
  private readonly cells = new Map<string, number[]>()
  private points: readonly {x: number; z: number}[] = []
  private candidates = new SpatialCandidateSet(0)
  constructor(privateCellSize: number) {
    if (!Number.isFinite(privateCellSize) || privateCellSize <= 0) throw new RangeError('Cell size must be positive and finite')
    this.cellSize = privateCellSize
  }
  private readonly cellSize: number
  rebuild(points: readonly {x: number; z: number}[]): void {
    this.cells.clear(); this.points = points; this.candidates = new SpatialCandidateSet(points.length)
    for (let i = 0; i < points.length; i++) {
      const point = points[i]!, key = this.key(Math.floor(point.x / this.cellSize), Math.floor(point.z / this.cellSize))
      let cell = this.cells.get(key)
      if (!cell) { cell = []; this.cells.set(key, cell) }
      cell.push(i)
    }
  }
  private key(x: number, z: number): string { return `${x}:${z}` }
  query(discs: readonly {x: number; z: number; radius: number}[]): readonly number[] {
    const candidates = this.candidates
    candidates.reset()
    for (const disc of discs) {
      const radius = Math.abs(disc.radius)
      if (![disc.x, disc.z, radius].every(Number.isFinite)) {
        // Non-finite inputs retain the caller's original exact predicate semantics.
        for (let i = 0; i < this.points.length; i++) candidates.add(i)
        continue
      }
      const minX = Math.floor((disc.x - radius) / this.cellSize), maxX = Math.floor((disc.x + radius) / this.cellSize)
      const minZ = Math.floor((disc.z - radius) / this.cellSize), maxZ = Math.floor((disc.z + radius) / this.cellSize)
      if (![minX, maxX, minZ, maxZ].every(Number.isSafeInteger) ||
        (maxX - minX + 1) * (maxZ - minZ + 1) > Math.max(64, this.cells.size * 4)) {
        for (let i = 0; i < this.points.length; i++) candidates.add(i)
        continue
      }
      for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) {
        const cell = this.cells.get(this.key(x, z))
        if (cell) for (const index of cell) candidates.add(index)
      }
    }
    candidates.values.sort((a, b) => a - b)
    return candidates.values
  }
  clear(): void { this.cells.clear(); this.points = []; this.candidates = new SpatialCandidateSet(0) }
}
