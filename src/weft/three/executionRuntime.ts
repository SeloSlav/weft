import * as THREE from 'three'
import { SurfaceLayoutDriver, type SurfaceLayoutDriverOptions, type LayoutTraversalOptions,
  type SurfaceLayoutLine, type SurfaceLayoutSlot } from '../core'

type Row<TokenId extends string, Meta> = {
  spanMin: number; spanMax: number; lineCoord: number; offset: number
  slots: SurfaceLayoutSlot[]; widths: number[]; visible: boolean[]
  lines: SurfaceLayoutLine<TokenId, Meta>[]
  widthKey?: readonly unknown[]
}
export type SurfaceExecutionStats = {
  traversals: number; rebuiltRows: number; replayedRows: number; emittedLines: number
  projectionPasses: number; skippedPasses: number; cachedRows: number
}

/** Execution kernel shared by custom surfaces and the specialized preset projectors.
 * A row is the reflow dependency unit. Cached lines are borrowed and must not be mutated.
 * Meshes, glyph buckets and one-to-many projection remain owned by the projector.
 */
export class SurfaceExecutionRuntime<TokenId extends string = string, Meta = unknown> {
  private driver?: SurfaceLayoutDriver<TokenId, Meta>
  private readonly rows: (Row<TokenId, Meta> | undefined)[] = []
  private readonly passes = new Map<string, readonly unknown[]>()
  private disposed = false
  private readonly layout?: SurfaceLayoutDriverOptions<TokenId, Meta>
  private stats: SurfaceExecutionStats = { traversals: 0, rebuiltRows: 0, replayedRows: 0,
    emittedLines: 0, projectionPasses: 0, skippedPasses: 0, cachedRows: 0 }

  constructor(layout?: SurfaceLayoutDriverOptions<TokenId, Meta>) {
    this.layout = layout && { ...layout }
    if (this.layout) this.driver = new SurfaceLayoutDriver(this.layout)
  }

  private assertLive(): void { if (this.disposed) throw new Error('Surface execution runtime has been disposed') }

  /** Reuses a projection until its explicit dependencies change. force is for time-driven reactions. */
  run(pass: string, dependencies: readonly unknown[], project: () => void, force = false): boolean {
    this.assertLive()
    const previous = this.passes.get(pass)
    if (!force && previous && previous.length === dependencies.length &&
      dependencies.every((value, index) => Object.is(value, previous[index]))) {
      this.stats.skippedPasses++
      return false
    }
    // Commit dependencies only after successful projection, so errors remain retryable.
    project()
    this.passes.set(pass, dependencies.slice())
    this.stats.projectionPasses++
    return true
  }

  invalidate(): void { this.assertLive(); this.passes.clear() }
  clearCache(): void { this.assertLive(); this.rows.length = 0; this.driver?.clearCache(); this.invalidate() }
  getStats(): SurfaceExecutionStats { return { ...this.stats, cachedRows: this.rows.filter(Boolean).length } }
  getLayoutStats() { return this.driver?.getStats() }
  resetStats(): void {
    this.stats = { traversals: 0, rebuiltRows: 0, replayedRows: 0, emittedLines: 0,
      projectionPasses: 0, skippedPasses: 0, cachedRows: 0 }
    this.driver?.resetStats()
  }

  /** widthKey declares every input to effective width; omit for automatic exact-width checks.
   * Stream continuously changing layouts to avoid retaining rows that cannot be reused.
   */
  forEachLaidOutLine(options: LayoutTraversalOptions<TokenId, Meta>, widthKey?: readonly unknown[], mode: 'cached' | 'stream' = 'cached'): void {
    this.assertLive()
    const layout = this.layout
    const driver = this.driver
    if (!layout || !driver) throw new Error('This execution runtime has no authored layout')
    this.stats.traversals++
    if (mode === 'stream') {
      this.rows.length = 0
      driver.forEachLaidOutLine({ ...options, onLine: (line) => { this.stats.emittedLines++; options.onLine(line) } })
      return
    }
    const { spanMin, spanMax, lineCoordAtRow, rowOffsetAt, getMaxWidth, shouldVisitSlot,
      rowStart = 0, rowEnd = layout.rows, onLine } = options
    if (!Number.isFinite(rowStart) || !Number.isFinite(rowEnd)) throw new RangeError('Row interval must be finite')
    const step = (spanMax - spanMin) / layout.sectors
    for (let row = Math.max(0, Math.ceil(rowStart)); row < Math.min(layout.rows, rowEnd); row++) {
      const coord = lineCoordAtRow(row)
      const offset = rowOffsetAt ? rowOffsetAt(row, step) : (row % 2) * step * (layout.staggerFactor ?? 0.5)
      let cached = this.rows[row]
      const sameGeometry = cached && cached.spanMin === spanMin && cached.spanMax === spanMax &&
        cached.lineCoord === coord && cached.offset === offset
      let changed = !sameGeometry
      let widths = cached?.widths
      let visibility = cached?.visible
      const sameWidths = widthKey !== undefined && cached?.widthKey !== undefined &&
        widthKey.length === cached.widthKey.length && widthKey.every((value, index) => Object.is(value, cached!.widthKey![index]))
      if (sameGeometry && cached && !(sameWidths && !shouldVisitSlot && cached.visible.every(Boolean))) {
        for (let index = 0; index < cached.slots.length; index++) {
          const slot = cached.slots[index]!
          const width = sameWidths ? cached.widths[index]! : getMaxWidth(slot)
          if (!Number.isFinite(width)) throw new RangeError('Layout width must be finite')
          const visible = width > 0 && (!shouldVisitSlot || shouldVisitSlot(slot))
          const previousWidth = cached.widths[index]!
          const effectiveWidth = width > 0 ? Math.max(layout.minLayoutWidth ?? 8, width) : 0
          const previousEffectiveWidth = previousWidth > 0 ? Math.max(layout.minLayoutWidth ?? 8, previousWidth) : 0
          if (effectiveWidth !== previousEffectiveWidth || visible !== cached.visible[index]) {
            if (!changed) { widths = cached.widths.slice(); visibility = cached.visible.slice() }
            changed = true
          }
          if (changed) { widths![index] = width; visibility![index] = visible }
        }
      }
      if (changed) {
        const old = sameGeometry ? cached : undefined
        cached = { spanMin, spanMax, lineCoord: coord, offset, slots: [], widths: [], visible: [], lines: [],
          widthKey: widthKey?.slice() }
        let index = 0
        driver.forEachLaidOutLine({ ...options, rowStart: row, rowEnd: row + 1,
          lineCoordAtRow: () => coord, rowOffsetAt: () => offset,
          getMaxWidth: (slot) => {
            const width = old ? widths![index]! : getMaxWidth(slot)
            cached!.slots.push(slot)
            cached!.widths.push(width)
            cached!.visible.push(old ? visibility![index]! : width > 0 && (!shouldVisitSlot || shouldVisitSlot(slot)))
            index++
            return width
          },
          shouldVisitSlot: () => cached!.visible[index - 1]!,
          onLine: (line) => { cached!.lines.push(line) },
        })
        this.rows[row] = cached
        this.stats.rebuiltRows++
      } else {
        this.stats.replayedRows++
        if (widthKey && !sameWidths) cached!.widthKey = widthKey.slice()
      }
      for (const line of cached!.lines) { onLine(line); this.stats.emittedLines++ }
    }
  }

  /** Releases cached layouts and, optionally, all instance buffers in the projector's owned group.
   * Geometry, materials and textures stay under the projector's explicit ownership policy.
   */
  dispose(group?: THREE.Object3D): void {
    if (this.disposed) return
    this.driver?.dispose()
    this.rows.length = 0
    this.passes.clear()
    group?.traverse((object) => { if ((object as THREE.InstancedMesh).isInstancedMesh) (object as THREE.InstancedMesh).dispose() })
    this.disposed = true
  }
}
