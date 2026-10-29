export type CacheStats = {
  entries: number
  weight: number
  maxEntries: number
  maxWeight: number
  hits: number
  misses: number
  evictions: number
}

/** Small weighted LRU. Weight is supplied by the owner, not an estimate of JS heap bytes. */
export class BoundedCache<K, V> {
  private readonly entries = new Map<K, { value: V; weight: number }>()
  private weight = 0
  private hits = 0
  private misses = 0
  private evictions = 0

  private maxEntries: number
  private maxWeight: number
  constructor(maxEntries: number, maxWeight = Infinity) {
    this.maxEntries = maxEntries
    this.maxWeight = maxWeight
  }

  get(key: K): V | undefined {
    const entry = this.entries.get(key)
    if (!entry) { this.misses++; return undefined }
    this.hits++
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry.value
  }

  set(key: K, value: V, weight = 1): void {
    this.delete(key)
    if (this.maxEntries === 0 || this.maxWeight === 0 || weight > this.maxWeight) return
    this.entries.set(key, { value, weight })
    this.weight += weight
    this.trim()
  }

  delete(key: K): boolean {
    const entry = this.entries.get(key)
    if (!entry) return false
    this.weight -= entry.weight
    return this.entries.delete(key)
  }

  clear(): void {
    this.entries.clear()
    this.weight = this.hits = this.misses = this.evictions = 0
  }

  configure(maxEntries: number, maxWeight = Infinity): void {
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 0 || !(maxWeight >= 0)) {
      throw new RangeError('Cache limits must be non-negative; maxEntries must be a safe integer')
    }
    this.maxEntries = maxEntries
    this.maxWeight = maxWeight
    this.trim()
  }

  stats(): CacheStats {
    return { entries: this.entries.size, weight: this.weight, maxEntries: this.maxEntries,
      maxWeight: this.maxWeight, hits: this.hits, misses: this.misses, evictions: this.evictions }
  }

  private trim(): void {
    while (this.entries.size > this.maxEntries || this.weight > this.maxWeight) {
      this.delete(this.entries.keys().next().value!)
      this.evictions++
    }
  }
}
