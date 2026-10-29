import { SurfaceExecutionRuntime } from '../executionRuntime'
import { updateInstanceMatrices, updateAttributeSpan } from '../helpers/bufferUpdates'
import { SpatialCandidateSet, SpatialPointIndex } from '../../runtime'
import { layoutNextLine, type LayoutCursor } from '@chenglou/pretext'
import * as THREE from 'three'
import { isPortableSurface, type PreparedSurfaceSource, type SeedCursorFactory } from '../../core'
import type { BookGlyphMeta, PortableBookPageSurface } from './bookPageSource'
import { graphemesOf } from '../../../samples/graphemes'

const ROWS = 18
const MAX_PER_BUCKET = 3200
const LAYOUT_PX_PER_SLOT = 820
/** Bumps canvas cache when glyph style changes (color/size). */
const GLYPH_TEX_TAG = 'v4-kindle-paper'

export type BookPageParams = {
  /** Only react when the player is inside this thin slab around the text plane. */
  activationDepth: number
  /** 3D radius (local space) where glyphs react to the player. */
  influenceRadius: number
  /** Max displacement along the player→glyph axis (world units). */
  pushStrength: number
  /** Glyphs closer than this 3D distance are hidden (tunnel through the field). */
  coreClearRadius: number
}

export const DEFAULT_BOOK_PAGE_PARAMS: BookPageParams = {
  activationDepth: 1.5,
  influenceRadius: 2.8,
  pushStrength: 1.95,
  coreClearRadius: 0.58,
}

const charTextureCache = new Map<string, THREE.CanvasTexture>()

const dummy = new THREE.Object3D()
const tmpLocalPlayer = new THREE.Vector3()

function getCharTexture(glyph: string): THREE.CanvasTexture {
  const key = `${glyph}\0${GLYPH_TEX_TAG}`
  let tex = charTextureCache.get(key)
  if (tex) return tex

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    canvas.width = 8
    canvas.height = 8
    tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    charTextureCache.set(key, tex)
    return tex
  }

  const font = '500 96px "Baskerville", "Palatino Linotype", Georgia, serif'
  ctx.font = font
  const m = ctx.measureText(glyph)
  const w = Math.ceil(Math.max(16, m.width) + 16)
  const h = Math.ceil(112)
  canvas.width = w
  canvas.height = h
  ctx.font = font
  ctx.fillStyle = 'rgba(0,0,0,0)'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#2a2218'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = 'rgba(255,245,225,0.35)'
  ctx.shadowBlur = 2
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 1
  ctx.fillText(glyph, 8, h * 0.52)
  ctx.shadowBlur = 0

  tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  charTextureCache.set(key, tex)
  return tex
}

function getCharPlaneScale(glyph: string, baseHeight: number): { sx: number; sy: number } {
  const tex = getCharTexture(glyph)
  const img = tex.image as HTMLCanvasElement
  const aspect = img.width / Math.max(1, img.height)
  return { sx: baseHeight * aspect, sy: baseHeight }
}

const sharedPlaneGeometry = new THREE.PlaneGeometry(1, 1)

export type CreateBookPageEffectOptions = {
  surface: PreparedSurfaceSource<string, BookGlyphMeta>
  seedCursor: SeedCursorFactory
  wallWidth: number
  wallHeight: number
  initialParams?: Partial<BookPageParams>
}

type GlyphPlacement = {
  glyph: string
  x: number
  y: number
  sx: number
  sy: number
}
type CachedGlyph = { placement: GlyphPlacement; matrix: Float32Array; visible: boolean; outputIndex: number; ordinal: number }

export class BookPageEffect {
  readonly group = new THREE.Group()
  private readonly runtime = new SurfaceExecutionRuntime()
  readonly interactionMesh: THREE.Mesh

  private readonly surface: PreparedSurfaceSource<string, BookGlyphMeta>
  private readonly portableBook?: PortableBookPageSurface['portableBook']
  private readonly wallWidth: number
  private readonly wallHeight: number
  private readonly buckets = new Map<string, THREE.InstancedMesh>()
  private readonly bucketCounts = new Map<string, number>()
  private readonly placements: GlyphPlacement[] = []
  private readonly spatial = new SpatialPointIndex(2)
  private readonly cachedGlyphs: CachedGlyph[] = []
  private readonly glyphBuckets = new Map<string, number[]>()
  private candidates = new SpatialCandidateSet(0)
  private previousCandidates: number[] = []
  private projectedGlyphs = 0
  private params: BookPageParams = { ...DEFAULT_BOOK_PAGE_PARAMS }
  /** Large enough to read nearby, but not so large that adjacent text rows overlap. */
  private readonly baseGlyphHeight = 0.22
  private playerWorld = new THREE.Vector3(0, 0, 1e6)
  private wasActiveLastFrame = false

  constructor(options: CreateBookPageEffectOptions) {
    const { surface, seedCursor: _seedCursor, wallWidth, wallHeight } = options
    if (isPortableSurface(surface)) throw new Error('Use createPortableBookPageSurface for portable book layouts')
    this.surface = surface
    this.portableBook = (surface as Partial<PortableBookPageSurface>).portableBook
    this.wallWidth = wallWidth
    this.wallHeight = wallHeight
    this.params = { ...DEFAULT_BOOK_PAGE_PARAMS, ...options.initialParams }

    for (const entry of surface.palette) {
      if (/^\s+$/.test(entry.glyph)) continue
      const map = getCharTexture(entry.glyph)
      const mat = new THREE.MeshBasicMaterial({
        map,
        alphaTest: 0.35,
        depthWrite: true,
        side: THREE.DoubleSide,
        toneMapped: false,
      })
      const mesh = new THREE.InstancedMesh(sharedPlaneGeometry, mat, MAX_PER_BUCKET)
      mesh.frustumCulled = false
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      this.buckets.set(entry.glyph, mesh)
      this.bucketCounts.set(entry.glyph, 0)
      this.group.add(mesh)
    }

    const interactionMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    this.interactionMesh = new THREE.Mesh(new THREE.PlaneGeometry(wallWidth, wallHeight), interactionMaterial)
    this.interactionMesh.position.set(0, wallHeight * 0.5, 0.02)
    this.group.add(this.interactionMesh)

    this.buildPlacements()
    this.renderPlacements(false)
    this.buildOutputCache()
  }

  setParams(params: Partial<BookPageParams>): void {
    this.params = { ...this.params, ...params }
  }

  /** Drive proximity reaction from a world-space point (player root). */
  setPlayerWorldPoint(world: THREE.Vector3): void {
    this.playerWorld.copy(world)
  }

  getRuntimeStats() { return this.runtime.getStats() }
  getOutputCacheStats() { return { cachedGlyphs: this.cachedGlyphs.length, projectedGlyphs: this.projectedGlyphs } }

  dispose(): void {
    this.runtime.dispose(this.group)
    this.spatial.clear(); this.candidates = new SpatialCandidateSet(0)
    this.cachedGlyphs.length = 0; this.glyphBuckets.clear(); this.previousCandidates.length = 0
    for (const mesh of this.buckets.values()) {
      const mat = mesh.material as THREE.MeshBasicMaterial
      mat.dispose()
    }
    ;(this.interactionMesh.material as THREE.MeshBasicMaterial).dispose()
    ;(this.interactionMesh.geometry as THREE.BufferGeometry).dispose()
  }

  update(_elapsedTime: number): void {
    tmpLocalPlayer.copy(this.playerWorld)
    this.group.worldToLocal(tmpLocalPlayer)
    const canAffectGlyphs =
      Math.abs(tmpLocalPlayer.z) <= this.params.activationDepth &&
      tmpLocalPlayer.x >= -this.wallWidth * 0.5 - this.params.influenceRadius &&
      tmpLocalPlayer.x <= this.wallWidth * 0.5 + this.params.influenceRadius &&
      tmpLocalPlayer.y >= -this.params.influenceRadius &&
      tmpLocalPlayer.y <= this.wallHeight + this.params.influenceRadius

    if (!canAffectGlyphs && !this.wasActiveLastFrame) return

    this.runtime.run('glyphs', [this.params, canAffectGlyphs,
      canAffectGlyphs ? tmpLocalPlayer.x : 0, canAffectGlyphs ? tmpLocalPlayer.y : 0,
      canAffectGlyphs ? tmpLocalPlayer.z : 0], () => this.updateCachedPlacements(canAffectGlyphs))
    this.wasActiveLastFrame = canAffectGlyphs
  }

  private buildPlacements(): void {
    const lines: Array<{
      row: number
      y: number
      glyphs: Array<{
        glyph: string
        isSpace: boolean
        sx: number
        sy: number
      }>
      totalAdvance: number
    }> = []

    let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
    let portableIndex = 0
    for (let row = 0; row < ROWS; row++) {
      let lineTokens: string[]
      if (this.portableBook) {
        const { tokens, tokenAdvance, spaceAdvance } = this.portableBook
        if (portableIndex >= tokens.length) break
        lineTokens = []
        let width = 0
        while (portableIndex < tokens.length && tokens[portableIndex] !== '\n') {
          const glyph = tokens[portableIndex]!
          const advance = glyph === ' ' ? spaceAdvance : tokenAdvance
          if (lineTokens.length && width + advance > LAYOUT_PX_PER_SLOT) break
          width += advance
          lineTokens.push(glyph)
          portableIndex++
        }
        if (tokens[portableIndex] === '\n') portableIndex++
      } else {
        const laidOut = layoutNextLine(this.surface.prepared, cursor, LAYOUT_PX_PER_SLOT)
        if (laidOut === null) break
        cursor = laidOut.end
        lineTokens = graphemesOf(laidOut.text).filter((glyph) => glyph !== '\n' && glyph !== '\r')
      }

      const resolvedGlyphs = lineTokens
        .map((glyph) => this.surface.glyphLookup.get(glyph))
        .filter((glyph): glyph is NonNullable<typeof glyph> => glyph !== undefined)

      const lineGlyphs = resolvedGlyphs.map((token) => {
        const isSpace = /^\s+$/.test(token.glyph)
        const { sx, sy } = isSpace
          ? { sx: this.baseGlyphHeight * 0.38 * (this.portableBook ? this.portableBook.spaceAdvance / 6 : 1), sy: this.baseGlyphHeight }
          : this.portableBook
            ? { sx: this.baseGlyphHeight * 0.6 * this.portableBook.tokenAdvance / 12, sy: this.baseGlyphHeight }
            : getCharPlaneScale(token.glyph, this.baseGlyphHeight)
        return { glyph: token.glyph, isSpace, sx, sy }
      })

      let totalAdvance = 0
      for (let i = 0; i < lineGlyphs.length; i++) {
        const glyph = lineGlyphs[i]!
        totalAdvance += glyph.isSpace ? glyph.sx : glyph.sx * 0.9
      }
      if (totalAdvance <= 0) continue

      const topInset = 1.6
      const bottomInset = 0.9
      const y =
        this.wallHeight -
        topInset -
        (row / Math.max(1, ROWS - 1)) * (this.wallHeight - topInset - bottomInset)
      lines.push({ row, y, glyphs: lineGlyphs, totalAdvance })
    }

    let widestAdvance = 0
    for (let i = 0; i < lines.length; i++) {
      widestAdvance = Math.max(widestAdvance, lines[i]!.totalAdvance)
    }
    if (widestAdvance <= 0) return

    const usableWidth = this.wallWidth * 0.94
    const fitScale = Math.min(1, usableWidth / widestAdvance)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!
      const paragraphIndent = line.row === 0 ? this.baseGlyphHeight * 1.9 : 0
      let cursorX = -this.wallWidth * 0.5 + 0.35 + paragraphIndent

      for (let k = 0; k < line.glyphs.length; k++) {
        const glyph = line.glyphs[k]!
        const advance = (glyph.isSpace ? glyph.sx : glyph.sx * 0.9) * fitScale
        const centerX = cursorX + advance * 0.5
        cursorX += advance

        if (glyph.isSpace) continue
        if (!this.buckets.has(glyph.glyph)) continue

        this.placements.push({
          glyph: glyph.glyph,
          x: centerX,
          y: line.y,
          sx: glyph.sx * fitScale,
          sy: glyph.sy * fitScale,
        })
      }
    }
  }

  private renderPlacements(isActive: boolean): void {
    for (const k of this.bucketCounts.keys()) {
      this.bucketCounts.set(k, 0)
    }

    for (let i = 0; i < this.placements.length; i++) {
      const placement = this.placements[i]!
      const mesh = this.buckets.get(placement.glyph)
      if (!mesh) continue

      let visible = true
      let ox = 0
      let oy = 0
      let oz = 0

      if (isActive) {
        const ux = placement.x - tmpLocalPlayer.x
        const uy = placement.y - tmpLocalPlayer.y
        const uz = -tmpLocalPlayer.z
        const dist = Math.sqrt(ux * ux + uy * uy + uz * uz)

        if (dist < this.params.coreClearRadius) {
          visible = false
        } else if (dist < this.params.influenceRadius && dist > 1e-5) {
          const t = 1 - dist / this.params.influenceRadius
          const s = t * t * (3 - 2 * t)
          const push = s * this.params.pushStrength
          const inv = 1 / dist
          ox = ux * inv * push
          oy = uy * inv * push
          oz = uz * inv * push
        }
      }

      if (!visible) continue

      const idx = this.bucketCounts.get(placement.glyph) ?? 0
      if (idx >= MAX_PER_BUCKET) continue

      dummy.position.set(placement.x + ox, placement.y + oy, oz)
      dummy.scale.set(placement.sx, placement.sy, 1)
      dummy.rotation.set(0, 0, 0)
      dummy.updateMatrix()

      mesh.setMatrixAt(idx, dummy.matrix)
      this.bucketCounts.set(placement.glyph, idx + 1)
    }

    for (const [glyph, mesh] of this.buckets) {
      mesh.count = this.bucketCounts.get(glyph) ?? 0
      updateInstanceMatrices(mesh)
    }
  }

  private buildOutputCache(): void {
    const counts = new Map<string, number>()
    const points: { x: number; z: number }[] = []
    for (const placement of this.placements) {
      dummy.position.set(placement.x, placement.y, 0)
      dummy.scale.set(placement.sx, placement.sy, 1)
      dummy.rotation.set(0, 0, 0); dummy.updateMatrix()
      const ordinal = counts.get(placement.glyph) ?? 0
      counts.set(placement.glyph, ordinal + 1)
      const index = this.cachedGlyphs.length
      this.cachedGlyphs.push({ placement, matrix: Float32Array.from(dummy.matrix.elements), visible: true,
        outputIndex: ordinal < MAX_PER_BUCKET ? ordinal : -1, ordinal })
      let bucket = this.glyphBuckets.get(placement.glyph)
      if (!bucket) { bucket = []; this.glyphBuckets.set(placement.glyph, bucket) }
      bucket.push(index); points.push({ x: placement.x, z: placement.y })
    }
    this.spatial.rebuild(points)
    this.candidates = new SpatialCandidateSet(points.length)
  }

  private updateCachedPlacements(isActive: boolean): void {
    const radius = Math.max(0, Number.isNaN(this.params.influenceRadius) ? 0 : this.params.influenceRadius,
      Number.isNaN(this.params.coreClearRadius) ? 0 : this.params.coreClearRadius)
    const current: number[] = []
    if (isActive) for (const index of this.spatial.query([{ x: tmpLocalPlayer.x, z: tmpLocalPlayer.y, radius }], false)) {
      const p = this.cachedGlyphs[index]!.placement
      const dx = p.x - tmpLocalPlayer.x, dy = p.y - tmpLocalPlayer.y
      if (dx * dx + dy * dy + tmpLocalPlayer.z * tmpLocalPlayer.z < radius * radius) current.push(index)
    }
    const candidates = this.candidates
    candidates.reset()
    for (const index of this.previousCandidates) candidates.add(index)
    for (const index of current) candidates.add(index)
    this.previousCandidates = current
    const changedBuckets = new Map<string, { repack: boolean; first: number; indices: number[] }>()
    for (const index of candidates.values) {
      const cached = this.cachedGlyphs[index]!, p = cached.placement
      let visible = true, ox = 0, oy = 0, oz = 0
      if (isActive) {
        const ux = p.x - tmpLocalPlayer.x, uy = p.y - tmpLocalPlayer.y, uz = -tmpLocalPlayer.z
        const dist = Math.sqrt(ux * ux + uy * uy + uz * uz)
        if (dist < this.params.coreClearRadius) visible = false
        else if (dist < this.params.influenceRadius && dist > 1e-5) {
          const t = 1 - dist / this.params.influenceRadius
          const push = t * t * (3 - 2 * t) * this.params.pushStrength
          const inv = 1 / dist
          ox = ux * inv * push; oy = uy * inv * push; oz = uz * inv * push
        }
      }
      const px = Math.fround(p.x + ox), py = Math.fround(p.y + oy), pz = Math.fround(oz)
      const changed = visible !== cached.visible || cached.matrix[12] !== px || cached.matrix[13] !== py || cached.matrix[14] !== pz
      cached.matrix[12] = px; cached.matrix[13] = py; cached.matrix[14] = pz
      this.projectedGlyphs++
      if (!changed) continue
      let bucket = changedBuckets.get(p.glyph)
      if (!bucket) { bucket = { repack: false, first: cached.ordinal, indices: [] }; changedBuckets.set(p.glyph, bucket) }
      bucket.first = Math.min(bucket.first, cached.ordinal)
      if (visible !== cached.visible) bucket.repack = true
      cached.visible = visible; bucket.indices.push(index)
    }
    for (const [glyph, change] of changedBuckets) {
      const mesh = this.buckets.get(glyph)!, array = mesh.instanceMatrix.array as Float32Array
      let first = Infinity, last = -1
      if (change.repack) {
        const indices = this.glyphBuckets.get(glyph)!
        let count = 0
        for (let i = change.first - 1; i >= 0; i--) {
          const prior = this.cachedGlyphs[indices[i]!]!.outputIndex
          if (prior >= 0) { count = prior + 1; break }
        }
        first = count
        for (let i = change.first; i < indices.length; i++) {
          const index = indices[i]!
          const glyphState = this.cachedGlyphs[index]!
          glyphState.outputIndex = glyphState.visible && count < MAX_PER_BUCKET ? count++ : -1
          if (glyphState.outputIndex >= 0) array.set(glyphState.matrix, glyphState.outputIndex * 16)
        }
        mesh.count = count; last = count
      } else for (const index of change.indices) {
        const glyphState = this.cachedGlyphs[index]!, output = glyphState.outputIndex
        if (output < 0) continue
        array.set(glyphState.matrix, output * 16); first = Math.min(first, output); last = Math.max(last, output + 1)
      }
      if (last > first) updateAttributeSpan(mesh.instanceMatrix, first, last - first)
    }
  }
}

export function createBookPageEffect(options: CreateBookPageEffectOptions): BookPageEffect {
  return new BookPageEffect(options)
}
