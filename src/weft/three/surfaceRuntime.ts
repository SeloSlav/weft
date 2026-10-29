import { SurfaceExecutionRuntime } from './executionRuntime'
import * as THREE from 'three'
import { seedCursor, type PreparedSurfaceSource, type ResolvedSurfaceGlyph,
  type SeedCursorFactory, type SurfaceLayoutLine, type SurfaceLayoutSlot } from '../core'
import { decayRecoveringStrength, type SurfaceBehavior } from '../runtime'
import { createInstancedMesh, type ThreeInstancedMeshRendererConfig } from './helpers/instancing'
import type { FieldLayoutConfig, WallLayoutConfig, SkyLayoutConfig } from './helpers/layouts'
import { updateAttributeSpan } from './helpers/bufferUpdates'
import { InputVersionTracker } from './helpers/inputVersion'

export type SurfaceRuntimeConfig<TokenId extends string = string, Meta = unknown> = {
  id: string
  source: PreparedSurfaceSource<TokenId, Meta>
  layout: FieldLayoutConfig | WallLayoutConfig | SkyLayoutConfig
  seedCursor?: SeedCursorFactory
  renderer?: { kind: string; config: ThreeInstancedMeshRendererConfig }
  behaviors?: readonly SurfaceBehavior[]
}

export type SurfaceProjectionTarget = { transform: THREE.Object3D; color: THREE.Color }
export type SurfaceProjectionContext<TokenId extends string = string, Meta = unknown> = {
  glyph: ResolvedSurfaceGlyph<TokenId, Meta>
  slot: Readonly<SurfaceLayoutSlot>
  glyphIndex: number
  glyphCount: number
  elapsedTime: number
}
export type SurfaceRuntimeOptions<TokenId extends string = string, Meta = unknown> = {
  spanMin: number
  spanMax: number
  lineCoordAtRow: (row: number) => number
  rowOffsetAt?: (row: number, sectorStep: number) => number
  getMaxWidth: (slot: SurfaceLayoutSlot) => number
  shouldVisitSlot?: (slot: SurfaceLayoutSlot) => boolean
  projectGlyph: (context: SurfaceProjectionContext<TokenId, Meta>, target: SurfaceProjectionTarget) => void
  /** Return a stable revision; change it when mutable layout or projection inputs change. */
  inputVersion?: () => unknown
  /** Runs each update, including idle frames; use for shader uniforms, or invalidate time-driven poses. */
  onFrame?: (elapsedTime: number, delta: number) => void
  /** Geometry/material are borrowed by default. The runtime always owns its mesh and buffers. */
  disposeResources?: boolean
  maxImpacts?: number
}
export type SurfaceRuntimeStats = {
  updates: number; layoutPasses: number; projectedSlots: number; projectedInstances: number
  bufferWrites: number; writtenInstances: number; visibleInstances: number; activeImpacts: number
}
type Impact = { x: number; y: number; radius: number; strength: number; recoveryRate: number }
type SlotRecord<TokenId extends string, Meta> = {
  line: SurfaceLayoutLine<TokenId, Meta>; present: boolean; dirty: boolean
  matrices: Float32Array; colors: Float32Array; count: number; uploadedCount: number; start: number
  revision: number; uploadedRevision: number
}

/** Shared authored-layout runtime: cached projection, dirty rows, visibility, damage and bounded GPU writes. */
export class SurfaceEffectRuntime<TokenId extends string = string, Meta = unknown> {
  readonly group = new THREE.Group()
  readonly mesh: THREE.InstancedMesh
  private driver: SurfaceExecutionRuntime<TokenId, Meta>
  private readonly slots: (SlotRecord<TokenId, Meta> | undefined)[] = []
  private readonly dirtyRows = new Set<number>()
  private readonly inputVersionTracker = new InputVersionTracker()
  private dirtyAll = true
  private previousVisible: number[] = []
  private nextVisible: number[] = []
  private readonly target: SurfaceProjectionTarget = { transform: new THREE.Object3D(), color: new THREE.Color() }
  private readonly impacts: Impact[] = []
  private readonly damage: { radius: number; strength: number; recoveryRate: number } | null
  private lastElapsed: number | null = null
  private disposed = false
  private committed = false
  private readonly config: SurfaceRuntimeConfig<TokenId, Meta>
  private readonly options: SurfaceRuntimeOptions<TokenId, Meta>
  private readonly stats: SurfaceRuntimeStats = { updates: 0, layoutPasses: 0, projectedSlots: 0,
    projectedInstances: 0, bufferWrites: 0, writtenInstances: 0, visibleInstances: 0, activeImpacts: 0 }

  constructor(config: SurfaceRuntimeConfig<TokenId, Meta>, options: SurfaceRuntimeOptions<TokenId, Meta>) {
    this.config = { ...config, layout: { ...config.layout }, renderer: config.renderer && {
      ...config.renderer, config: { ...config.renderer.config } } }
    this.options = { ...options }
    if (!config.renderer || config.renderer.kind !== 'three-instanced-mesh') {
      throw new Error('Surface runtime requires threeInstancedMeshRenderer()')
    }
    if (!Number.isSafeInteger(config.renderer.config.maxInstances) || config.renderer.config.maxInstances <= 0) {
      throw new RangeError('Runtime maxInstances must be a positive safe integer')
    }
    if (!Number.isFinite(options.spanMin) || !Number.isFinite(options.spanMax) || options.spanMax <= options.spanMin) {
      throw new RangeError('Runtime span must be finite and increasing')
    }
    if (options.maxImpacts !== undefined && (!Number.isSafeInteger(options.maxImpacts) || options.maxImpacts <= 0)) {
      throw new RangeError('maxImpacts must be a positive safe integer')
    }
    const behaviors = config.behaviors ?? []
    if (behaviors.some((b) => b.kind !== 'recoverable-damage') || behaviors.length > 1) {
      throw new Error('Surface runtime currently supports one recoverable-damage behavior; use onFrame for custom behavior')
    }
    this.damage = behaviors.length ? { strength: 1,
      ...behaviors[0]!.config as { radius: number; strength?: number; recoveryRate: number } } : null
    if (this.damage && (!(this.damage.radius > 0) || !Number.isFinite(this.damage.radius) ||
      !Number.isFinite(this.damage.strength) || this.damage.strength < 0 ||
      !Number.isFinite(this.damage.recoveryRate) || this.damage.recoveryRate < 0)) {
      throw new RangeError('Damage radius must be positive; strength and recoveryRate must be finite and non-negative')
    }
    this.driver = this.createDriver(config.source)
    this.mesh = createInstancedMesh(config.renderer.config)
    this.mesh.count = 0
    this.mesh.setColorAt(0, new THREE.Color())
    this.mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage)
    this.group.name = config.id
    this.group.add(this.mesh)
  }

  private createDriver(source: PreparedSurfaceSource<TokenId, Meta>) {
    return new SurfaceExecutionRuntime({ ...this.config.layout, surface: source,
      seedCursor: this.config.seedCursor ?? seedCursor })
  }

  private assertLive(): void { if (this.disposed) throw new Error('Surface runtime has been disposed') }

  invalidate(): void { this.assertLive(); this.dirtyAll = true }

  /** Row interval [start, end). Reflow can affect later sectors, so a dirty row is the dependency unit. */
  invalidateRows(start: number, end = start + 1): void {
    this.assertLive()
    if (!Number.isFinite(start) || !Number.isFinite(end)) throw new RangeError('Dirty row interval must be finite')
    for (let row = Math.max(0, Math.ceil(start)); row < Math.min(end, this.config.layout.rows); row++) this.dirtyRows.add(row)
  }

  setSource(source: PreparedSurfaceSource<TokenId, Meta>): void {
    this.assertLive()
    const next = this.createDriver(source)
    this.driver.dispose()
    this.driver = next
    this.slots.length = 0
    this.previousVisible.length = 0
    this.invalidate()
  }

  /** Coordinates use the layout's span/line space; projection into world space remains caller-authored. */
  addImpact(x: number, lineCoord: number, options: { radius?: number; strength?: number } = {}): void {
    this.assertLive()
    if (!this.damage) throw new Error('Add recoverableDamage() to the effect before adding impacts')
    const impact = { x, y: lineCoord, radius: options.radius ?? this.damage.radius,
      strength: options.strength ?? this.damage.strength, recoveryRate: this.damage.recoveryRate }
    if (![x, lineCoord, impact.radius, impact.strength].every(Number.isFinite) || impact.radius <= 0 || impact.strength < 0) {
      throw new RangeError('Impact coordinates/strength must be finite and radius positive')
    }
    if (this.impacts.length >= (this.options.maxImpacts ?? 64)) this.invalidateImpact(this.impacts.shift()!)
    this.impacts.push(impact)
    this.invalidateImpact(impact)
  }

  clearImpacts(): void {
    this.assertLive()
    for (const impact of this.impacts) this.invalidateImpact(impact)
    this.impacts.length = 0
  }

  private invalidateImpact(impact: Impact): void {
    for (let row = 0; row < this.config.layout.rows; row++) {
      if (Math.abs(this.options.lineCoordAtRow(row) - impact.y) <= impact.radius) this.dirtyRows.add(row)
    }
  }

  private widthAt(slot: SurfaceLayoutSlot): number {
    const width = this.options.getMaxWidth(slot)
    let damage = 0
    for (const impact of this.impacts) {
      const dx = slot.spanCenter - impact.x
      const dy = slot.lineCoord - impact.y
      const r2 = impact.radius * impact.radius
      const d2 = dx * dx + dy * dy
      if (d2 >= r2) continue
      const t = Math.sqrt(d2 / r2)
      damage = Math.max(damage, Math.min(1, impact.strength) * (1 - t * t * (3 - 2 * t)))
    }
    return width * (1 - damage)
  }

  private rebuildRows(): void {
    if (!this.dirtyAll && this.dirtyRows.size === 0) return
    this.committed = false
    const { rows, sectors } = this.config.layout
    const visit = (start: number, end: number) => {
      for (let row = start; row < end; row++) for (let col = 0; col < sectors; col++) {
        const record = this.slots[row * sectors + col]
        if (record) record.present = false
      }
      this.driver.forEachLaidOutLine({ ...this.options, rowStart: start, rowEnd: end,
        // Cache authored lines independently of the current view.
        shouldVisitSlot: undefined, getMaxWidth: (slot) => this.widthAt(slot),
        onLine: (line) => {
          const index = line.slot.row * sectors + line.slot.sector
          const record = this.slots[index]
          if (record) { record.line = line; record.present = record.dirty = true }
          else this.slots[index] = { line, present: true, dirty: true, matrices: new Float32Array(0),
            colors: new Float32Array(0), count: 0, uploadedCount: -1, start: -1, revision: 0, uploadedRevision: -1 }
        } })
      for (let row = start; row < end; row++) for (let col = 0; col < sectors; col++) {
        const index = row * sectors + col
        if (this.slots[index] && !this.slots[index]!.present) this.slots[index] = undefined
      }
      this.stats.layoutPasses++
    }
    if (this.dirtyAll) visit(0, rows)
    else for (const row of this.dirtyRows) visit(row, row + 1)
    this.dirtyRows.clear()
    this.dirtyAll = false
  }

  private project(record: SlotRecord<TokenId, Meta>, elapsedTime: number): void {
    const glyphs = record.line.resolvedGlyphs
    const count = glyphs.length
    if (count > this.mesh.instanceMatrix.count) throw new RangeError('Surface runtime capacity exceeded; increase maxInstances or reduce width')
    if (record.matrices.length < count * 16) record.matrices = new Float32Array(count * 16)
    if (record.colors.length < count * 3) record.colors = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const { transform, color } = this.target
      transform.position.set(0, 0, 0)
      transform.rotation.set(0, 0, 0)
      transform.scale.set(1, 1, 1)
      color.setRGB(1, 1, 1)
      this.options.projectGlyph({ glyph: glyphs[i]!, slot: record.line.slot, glyphIndex: i,
        glyphCount: count, elapsedTime }, this.target)
      transform.updateMatrix()
      transform.matrix.toArray(record.matrices, i * 16)
      color.toArray(record.colors, i * 3)
    }
    record.count = count
    record.dirty = false
    record.revision++
    this.stats.projectedSlots++
    this.stats.projectedInstances += count
  }

  update(elapsedTime: number): void {
    this.assertLive()
    if (!Number.isFinite(elapsedTime)) throw new RangeError('Elapsed time must be finite')
    const delta = this.lastElapsed === null ? 0 : Math.max(0, elapsedTime - this.lastElapsed)
    this.lastElapsed = elapsedTime
    this.stats.updates++
    this.options.onFrame?.(elapsedTime, delta)
    if (this.options.inputVersion) this.inputVersionTracker.sync(this.options.inputVersion, () => this.invalidate())
    for (let i = this.impacts.length - 1; i >= 0; i--) {
      const impact = this.impacts[i]!
      const next = decayRecoveringStrength(impact.strength, impact.recoveryRate, delta)
      if (next !== impact.strength) { this.invalidateImpact(impact); impact.strength = next }
      if (next <= 0.015) this.impacts.splice(i, 1)
    }
    this.stats.activeImpacts = this.impacts.length
    // No visibility query or dirty dependencies: uniforms/time advance without a slot walk or array churn.
    if (this.committed && !this.dirtyAll && this.dirtyRows.size === 0 && !this.options.shouldVisitSlot) return
    this.rebuildRows()
    this.nextVisible.length = 0
    let total = 0
    let repack = false
    for (let i = 0; i < this.slots.length; i++) {
      const record = this.slots[i]
      if (!record || (this.options.shouldVisitSlot && !this.options.shouldVisitSlot(record.line.slot))) continue
      if (record.dirty) this.project(record, elapsedTime)
      const at = this.nextVisible.length
      this.nextVisible.push(i)
      if (this.previousVisible[at] !== i || record.uploadedCount !== record.count || record.start !== total) repack = true
      total += record.count
      if (total > this.mesh.instanceMatrix.count) throw new RangeError('Surface runtime capacity exceeded; increase maxInstances or reduce width')
    }
    repack ||= this.previousVisible.length !== this.nextVisible.length
    let start = 0
    for (const index of this.nextVisible) {
      const record = this.slots[index]!
      // A freshly projected record has not yet been committed, even if its population stayed constant.
      if (repack || record.revision !== record.uploadedRevision) {
        this.mesh.instanceMatrix.array.set(record.matrices.subarray(0, record.count * 16), start * 16)
        this.mesh.instanceColor!.array.set(record.colors.subarray(0, record.count * 3), start * 3)
        updateAttributeSpan(this.mesh.instanceMatrix, start, record.count)
        updateAttributeSpan(this.mesh.instanceColor!, start, record.count)
        this.stats.bufferWrites++
        this.stats.writtenInstances += record.count
        record.uploadedRevision = record.revision
      }
      record.start = start
      record.uploadedCount = record.count
      start += record.count
    }
    this.mesh.count = total
    this.stats.visibleInstances = total
    this.stats.activeImpacts = this.impacts.length
    const previous = this.previousVisible
    this.previousVisible = this.nextVisible
    this.nextVisible = previous
    this.committed = true
  }

  getStats(): SurfaceRuntimeStats { return { ...this.stats } }
  getLayoutStats() { return this.driver.getLayoutStats()! }
  needsUpdate(): boolean { return !this.disposed && (this.dirtyAll || this.dirtyRows.size > 0 || Boolean(this.options.onFrame || this.options.shouldVisitSlot) || this.impacts.some((i) => i.recoveryRate > 0) || Boolean(this.options.inputVersion && this.inputVersionTracker.changed(this.options.inputVersion))) }
  getInstanceIdentity(index: number): { row: number; sector: number; glyphIndex: number; tokenId: TokenId } | null {
    if (!Number.isInteger(index) || index < 0 || index >= this.mesh.count) return null
    let low = 0
    let high = this.previousVisible.length - 1
    while (low <= high) {
      const middle = (low + high) >>> 1
      const record = this.slots[this.previousVisible[middle]!]!
      if (index < record.start) high = middle - 1
      else if (index >= record.start + record.count) low = middle + 1
      else {
        const glyphIndex = index - record.start
        return { row: record.line.slot.row, sector: record.line.slot.sector,
          glyphIndex, tokenId: record.line.resolvedGlyphs[glyphIndex]!.id }
      }
    }
    return null
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.group.removeFromParent()
    this.group.clear()
    this.mesh.dispose()
    this.mesh.count = 0
    this.stats.visibleInstances = this.stats.activeImpacts = 0
    if (this.options.disposeResources) {
      this.mesh.geometry.dispose()
      const materials = Array.isArray(this.mesh.material) ? this.mesh.material : [this.mesh.material]
      for (const material of materials) material.dispose()
    }
    this.driver.dispose()
    this.slots.length = this.impacts.length = this.previousVisible.length = this.nextVisible.length = 0
    this.dirtyRows.clear()
  }
}

export function createSurfaceRuntime<TokenId extends string, Meta>(config: SurfaceRuntimeConfig<TokenId, Meta>,
  options: SurfaceRuntimeOptions<TokenId, Meta>): SurfaceEffectRuntime<TokenId, Meta> {
  return new SurfaceEffectRuntime(config, options)
}
