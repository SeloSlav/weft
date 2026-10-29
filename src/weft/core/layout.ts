import { layoutNextLine, type LayoutCursor, type PreparedTextWithSegments } from '@chenglou/pretext'
import { graphemesOf } from '../../samples/graphemes'
import { BoundedCache } from './cache'
import type {
  PreparedSurfaceSource,
  ResolvedSurfaceGlyph,
  SeedCursorFactory,
} from './text'

type SurfaceLayoutBandOptions<TokenId extends string = string, Meta = unknown> = {
  surface: PreparedSurfaceSource<TokenId, Meta>
  rows: number
  advanceForRow: (row: number) => number
  seedCursor: SeedCursorFactory
}

export type SurfaceLayoutDriverOptions<TokenId extends string = string, Meta = unknown> =
  SurfaceLayoutBandOptions<TokenId, Meta> & {
    sectors: number
    staggerFactor?: number
    minSpanFactor?: number
    minLayoutWidth?: number
  }

export type SurfaceLayoutSlot = {
  row: number
  sector: number
  lineCoord: number
  spanStart: number
  spanEnd: number
  spanCenter: number
  spanSize: number
  sectorStep: number
  rowOffset: number
}

export type SurfaceLayoutLine<TokenId extends string = string, Meta = unknown> = {
  slot: SurfaceLayoutSlot
  lineText: string
  glyphs: string[]
  resolvedGlyphs: ResolvedSurfaceGlyph<TokenId, Meta>[]
  tokenLineKey: string
  maxWidth: number
  cursorStart: LayoutCursor
  cursorEnd: LayoutCursor
}

export type LayoutTraversalOptions<TokenId extends string = string, Meta = unknown> = {
  spanMin: number
  spanMax: number
  lineCoordAtRow: (row: number) => number
  rowOffsetAt?: (row: number, sectorStep: number) => number
  getMaxWidth: (slot: SurfaceLayoutSlot) => number
  /** Suppress output/decoding only. Width and cursor advancement remain independent of visibility. */
  shouldVisitSlot?: (slot: SurfaceLayoutSlot) => boolean
  /** Optional row interval [rowStart, rowEnd), for dependency-safe incremental updates. */
  rowStart?: number
  rowEnd?: number
  onLine: (line: SurfaceLayoutLine<TokenId, Meta>) => void
}

const ROOT_CURSOR: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
const MAX_LINE_CACHE = 2048
const MAX_GLYPH_CACHE = 512

export type SurfaceLayoutStats = {
  slotsVisited: number
  lineLayouts: number
  lineCacheHits: number
  slotCacheHits: number
  glyphDecodes: number
  glyphCacheHits: number
  emittedLines: number
}
const newStats = (): SurfaceLayoutStats => ({ slotsVisited: 0, lineLayouts: 0, lineCacheHits: 0,
  slotCacheHits: 0, glyphDecodes: 0, glyphCacheHits: 0, emittedLines: 0 })
type LineTransition = { segmentIndex: number; graphemeIndex: number; maxWidth: number;
  result: ReturnType<typeof layoutNextLineOrRewind> }

function cloneCursor(cursor: LayoutCursor): LayoutCursor {
  return { segmentIndex: cursor.segmentIndex, graphemeIndex: cursor.graphemeIndex }
}

function layoutNextLineOrRewind(
  prepared: PreparedTextWithSegments,
  cursor: LayoutCursor,
  maxWidth: number,
) {
  let activeCursor = cloneCursor(cursor)
  let line = layoutNextLine(prepared, activeCursor, maxWidth)
  if (line === null) {
    activeCursor = cloneCursor(ROOT_CURSOR)
    line = layoutNextLine(prepared, activeCursor, maxWidth)
  }
  if (line === null) return null

  return {
    line,
    cursorEnd: cloneCursor(line.end),
  }
}

export function createBandSeeds<TokenId extends string, Meta>({
  surface,
  rows,
  advanceForRow,
  seedCursor,
}: SurfaceLayoutBandOptions<TokenId, Meta>): LayoutCursor[] {
  return Array.from({ length: rows }, (_, row) => seedCursor(surface.prepared, advanceForRow(row)))
}

export class SurfaceLayoutDriver<TokenId extends string = string, Meta = unknown> {
  private readonly prepared: PreparedTextWithSegments
  private readonly surface: PreparedSurfaceSource<TokenId, Meta>
  private readonly rows: number
  private readonly sectors: number
  private readonly staggerFactor: number
  private readonly minSpanFactor: number
  private readonly minLayoutWidth: number
  private readonly bandSeeds: LayoutCursor[]
  // Exact widths and cursors only: damage must never be quantized to a cached width.
  private readonly lineCache = new BoundedCache<string, ReturnType<typeof layoutNextLineOrRewind>>(MAX_LINE_CACHE)
  // One last transition per authored slot avoids LRU thrashing on stable surfaces larger than 2048 slots.
  private readonly slotTransitions: (LineTransition | undefined)[] = []
  private readonly glyphCache = new BoundedCache<string, {
    glyphs: string[]
    resolvedGlyphs: ResolvedSurfaceGlyph<TokenId, Meta>[]
    tokenLineKey: string
  }>(MAX_GLYPH_CACHE)
  private stats = newStats()
  private disposed = false

  constructor({
    surface,
    rows,
    sectors,
    advanceForRow,
    seedCursor,
    staggerFactor = 0.5,
    minSpanFactor = 0.33,
    minLayoutWidth = 8,
  }: SurfaceLayoutDriverOptions<TokenId, Meta>) {
    if (!Number.isSafeInteger(rows) || rows < 0 || !Number.isSafeInteger(sectors) || sectors <= 0 ||
      !Number.isSafeInteger(rows * sectors)) throw new RangeError('Layout rows/sectors must form a finite integer grid')
    this.surface = surface
    this.prepared = surface.prepared
    this.rows = rows
    this.sectors = sectors
    this.staggerFactor = staggerFactor
    this.minSpanFactor = minSpanFactor
    this.minLayoutWidth = minLayoutWidth
    this.bandSeeds = createBandSeeds({ surface, rows, advanceForRow, seedCursor })
  }

  getStats(): SurfaceLayoutStats { return { ...this.stats } }
  resetStats(): void { this.stats = newStats() }
  clearCache(): void {
    this.lineCache.clear()
    this.glyphCache.clear()
    this.slotTransitions.length = 0
  }
  dispose(): void { this.clearCache(); this.disposed = true }

  forEachLaidOutLine({
    spanMin,
    spanMax,
    lineCoordAtRow,
    rowOffsetAt,
    getMaxWidth,
    shouldVisitSlot,
    rowStart = 0,
    rowEnd = this.rows,
    onLine,
  }: LayoutTraversalOptions<TokenId, Meta>): void {
    if (this.disposed) throw new Error('Cannot traverse a disposed SurfaceLayoutDriver')
    if (!Number.isFinite(rowStart) || !Number.isFinite(rowEnd)) throw new RangeError('Row interval must be finite')
    const sectorStep = (spanMax - spanMin) / this.sectors

    for (let row = Math.max(0, Math.ceil(rowStart)); row < Math.min(this.rows, rowEnd); row++) {
      const lineCoord = lineCoordAtRow(row)
      const rowOffset = rowOffsetAt
        ? rowOffsetAt(row, sectorStep)
        : (row % 2) * sectorStep * this.staggerFactor
      let cursor = cloneCursor(this.bandSeeds[row] ?? ROOT_CURSOR)

      for (let sector = 0; sector < this.sectors; sector++) {
        const rawStart = spanMin + sector * sectorStep + rowOffset
        const rawEnd = rawStart + sectorStep
        const spanStart = Math.max(spanMin, rawStart)
        const spanEnd = Math.min(spanMax, rawEnd)
        const spanSize = spanEnd - spanStart
        if (spanSize < sectorStep * this.minSpanFactor) continue

        const slot: SurfaceLayoutSlot = {
          row,
          sector,
          lineCoord,
          spanStart,
          spanEnd,
          spanCenter: (spanStart + spanEnd) * 0.5,
          spanSize,
          sectorStep,
          rowOffset,
        }

        this.stats.slotsVisited++
        const requestedWidth = getMaxWidth(slot)
        if (!Number.isFinite(requestedWidth)) throw new RangeError('Layout width must be finite')
        if (requestedWidth <= 0) continue
        const maxWidth = Math.max(this.minLayoutWidth, requestedWidth)
        const cursorStart = cloneCursor(cursor)
        const slotIndex = row * this.sectors + sector
        const transition = this.slotTransitions[slotIndex]
        let laidOut: ReturnType<typeof layoutNextLineOrRewind>
        if (transition && transition.segmentIndex === cursorStart.segmentIndex &&
          transition.graphemeIndex === cursorStart.graphemeIndex && transition.maxWidth === maxWidth) {
          this.stats.slotCacheHits++
          laidOut = transition.result
        } else {
          const cacheKey = `${cursorStart.segmentIndex}:${cursorStart.graphemeIndex}:${maxWidth}`
          const cached = this.lineCache.get(cacheKey)
          if (cached !== undefined) { this.stats.lineCacheHits++; laidOut = cached }
          else {
            this.stats.lineLayouts++
            laidOut = layoutNextLineOrRewind(this.prepared, cursorStart, maxWidth)
            this.lineCache.set(cacheKey, laidOut)
          }
          this.slotTransitions[slotIndex] = { segmentIndex: cursorStart.segmentIndex,
            graphemeIndex: cursorStart.graphemeIndex, maxWidth, result: laidOut }
        }
        if (laidOut === null) continue

        cursor = cloneCursor(laidOut.cursorEnd)
        if (shouldVisitSlot && !shouldVisitSlot(slot)) continue
        let decoded = this.glyphCache.get(laidOut.line.text)
        if (!decoded) {
          this.stats.glyphDecodes++
          const glyphs = graphemesOf(laidOut.line.text).filter((glyph) => !/^\s+$/.test(glyph))
          if (glyphs.length === 0) continue
          const resolvedGlyphs = glyphs
            .map((glyph) => this.surface.glyphLookup.get(glyph))
            .filter((glyph): glyph is ResolvedSurfaceGlyph<TokenId, Meta> => glyph !== undefined)
          if (resolvedGlyphs.length !== glyphs.length) continue
          decoded = { glyphs, resolvedGlyphs, tokenLineKey: resolvedGlyphs.map((glyph) => glyph.id).join('|') }
          this.glyphCache.set(laidOut.line.text, decoded)
        } else this.stats.glyphCacheHits++

        this.stats.emittedLines++
        onLine({
          slot,
          lineText: laidOut.line.text,
          // Callbacks may retain or mutate their arrays/cursors; never expose the cache entries.
          glyphs: decoded.glyphs.slice(),
          resolvedGlyphs: decoded.resolvedGlyphs.slice(),
          tokenLineKey: decoded.tokenLineKey,
          maxWidth,
          cursorStart,
          cursorEnd: cloneCursor(laidOut.cursorEnd),
        })
      }
    }
  }
}
