import {
  layoutNextLine,
  prepareWithSegments,
  clearCache as clearMeasurementCache,
  type LayoutCursor,
  type LayoutLine,
  type PreparedTextWithSegments,
} from '@chenglou/pretext'
import { BoundedCache } from './cache'

export const WEFT_TEXT_FONT =
  '22px "Segoe UI Symbol", "Cascadia Code", "Noto Sans Symbols 2", sans-serif'

type TextCacheEntry = { text: string; font: string; prepared: PreparedTextWithSegments }
type SourceCacheEntry = {
  font: string
  repeat: number
  palette: readonly SurfacePaletteEntry<string, unknown>[]
  source: PreparedSurfaceSource<string, unknown>
}
const DEFAULT_CACHE_LIMITS = { maxEntries: 128, maxTextUnits: 1_000_000 }
const preparedCache = new BoundedCache<string, TextCacheEntry>(128, 1_000_000)
const preparedSurfaceCache = new BoundedCache<string, SourceCacheEntry>(128, 1_000_000)
const EMPTY_META = Object.freeze({})

export type SurfaceCacheOptions = { maxEntries?: number; maxTextUnits?: number }
let cacheLimits = { ...DEFAULT_CACHE_LIMITS }

/** Limits apply to each cache; text units are UTF-16 code units, not heap bytes. Zero disables retention. */
export function configureSurfaceCaches(options: SurfaceCacheOptions = {}): void {
  const next = { ...cacheLimits, ...options }
  if (!Number.isSafeInteger(next.maxEntries) || next.maxEntries < 0 ||
    !Number.isSafeInteger(next.maxTextUnits) || next.maxTextUnits < 0) {
    throw new RangeError('Surface cache limits must be non-negative safe integers')
  }
  cacheLimits = next
  preparedCache.configure(next.maxEntries, next.maxTextUnits)
  preparedSurfaceCache.configure(next.maxEntries, next.maxTextUnits)
}

export function getSurfaceCacheStats() {
  return { text: preparedCache.stats(), sources: preparedSurfaceCache.stats() }
}

/** Eviction never invalidates prepared handles already held by a caller or driver. */
export function releaseSurfaceSource(cacheKey: string): boolean {
  const text = preparedCache.delete(cacheKey)
  const source = preparedSurfaceCache.delete(cacheKey)
  return text || source
}

export function clearSurfaceCaches(options: { measurements?: boolean } = {}): void {
  preparedCache.clear()
  preparedSurfaceCache.clear()
  clearSeedCursorCache()
  // Pretext's measurement cache may also be shared with non-Weft code: clearing it is opt-in.
  if (options.measurements) clearMeasurementCache()
}

export type SurfacePaletteEntry<TokenId extends string = string, Meta = unknown> = {
  id: TokenId
  glyph: string
  weight?: number
  meta: Meta
}

export type SurfaceGlyphUnits = readonly string[]
export type SurfaceShorthandMeta = Record<string, never>

export type ResolvedSurfaceGlyph<TokenId extends string = string, Meta = unknown> = {
  id: TokenId
  glyph: string
  ordinal: number
  meta: Meta
}

export type PreparedSurfaceSource<TokenId extends string = string, Meta = unknown> = {
  cacheKey: string
  prepared: PreparedTextWithSegments
  palette: readonly SurfacePaletteEntry<TokenId, Meta>[]
  glyphLookup: ReadonlyMap<string, ResolvedSurfaceGlyph<TokenId, Meta>>
  /** Repetition count for palette-based sources; absent for free-form text. */
  repeat?: number
}

type PortableStream = { glyphs: string[]; tokenAdvance: number; spaceAdvance: number }
const portableStreams = new WeakMap<PreparedTextWithSegments, PortableStream>()
export type PortableSurfaceOptions = { tokenAdvance?: number; spaceAdvance?: number; repeat?: number }

/** Use fixed advances and opaque palette tokens for placement independent of font metrics. */
export function makeSurfacePortable<TokenId extends string, Meta>(
  source: PreparedSurfaceSource<TokenId, Meta>, options: PortableSurfaceOptions = {},
): PreparedSurfaceSource<TokenId, Meta> {
  const repeat = options.repeat ?? source.repeat
  if (repeat === undefined) throw new Error('Portable palette sources require a repeat count')
  validateRepeat(repeat)
  const tokenAdvance = options.tokenAdvance ?? 12
  const spaceAdvance = options.spaceAdvance ?? 6
  if (!Number.isFinite(tokenAdvance) || tokenAdvance <= 0 || !Number.isFinite(spaceAdvance) || spaceAdvance < 0) {
    throw new RangeError('Portable tokenAdvance must be positive and spaceAdvance non-negative, both finite')
  }
  const glyphs: string[] = []
  for (const entry of source.palette) {
    if (!entry.glyph || /\s/u.test(entry.glyph)) throw new Error('Portable palette tokens must be nonempty and contain no whitespace')
    if (!Number.isFinite(entry.weight ?? 1) || (entry.weight ?? 1) < 0) throw new RangeError('Portable token weight must be finite and non-negative')
  }
  for (let r = 0; r < repeat; r++) for (const entry of source.palette) {
    const weight = Math.max(1, Math.floor(entry.weight ?? 1))
    for (let i = 0; i < weight; i++) glyphs.push(entry.glyph)
  }
  // Keep the real Pretext handle available to consumers, while isolating the portable cursor registry.
  const prepared = { ...source.prepared }
  portableStreams.set(prepared, { glyphs, tokenAdvance, spaceAdvance })
  return { ...source, prepared, repeat }
}

export function isPortableSurface(source: PreparedSurfaceSource): boolean {
  return portableStreams.has(source.prepared)
}

/** Internal portable cursor semantics: segmentIndex is the next opaque palette token. */
export function layoutSurfaceNextLine(prepared: PreparedTextWithSegments, cursor: LayoutCursor, maxWidth: number): LayoutLine | null {
  const stream = portableStreams.get(prepared)
  if (!stream) return layoutNextLine(prepared, cursor, maxWidth)
  const start = cursor.segmentIndex
  if (!Number.isSafeInteger(start) || start < 0 || cursor.graphemeIndex !== 0) throw new RangeError('Invalid portable surface cursor')
  if (start >= stream.glyphs.length) return null
  let end = start + 1
  let width = stream.tokenAdvance
  const nextAdvance = stream.spaceAdvance + stream.tokenAdvance
  while (end < stream.glyphs.length && width + nextAdvance <= maxWidth) { width += nextAdvance; end++ }
  return { text: stream.glyphs.slice(start, end).join(' '), width,
    start: { segmentIndex: start, graphemeIndex: 0 }, end: { segmentIndex: end, graphemeIndex: 0 } }
}

export type SeedCursorFactory = (
  preparedText: PreparedTextWithSegments,
  advance: number,
) => LayoutCursor

function validateRepeat(repeat: number): void {
  if (!Number.isSafeInteger(repeat) || repeat < 0) throw new RangeError('Surface repeat must be a non-negative safe integer')
}

export function buildRepeatedUnitStream(units: readonly string[], repeat: number): string {
  validateRepeat(repeat)
  const chunks: string[] = []
  for (let r = 0; r < repeat; r++) {
    for (let i = 0; i < units.length; i++) {
      chunks.push(units[i]!)
      chunks.push(' ')
    }
  }
  return chunks.join('')
}

export function prepareCachedSurfaceText(
  cacheKey: string,
  sourceText: string,
  font = WEFT_TEXT_FONT,
): PreparedTextWithSegments {
  const cached = preparedCache.get(cacheKey)
  if (cached && cached.text === sourceText && cached.font === font) return cached.prepared

  const prepared = prepareWithSegments(sourceText, font)
  preparedCache.set(cacheKey, { text: sourceText, font, prepared }, sourceText.length)
  return prepared
}

export function buildWeightedPaletteStream<TokenId extends string, Meta>(
  palette: readonly SurfacePaletteEntry<TokenId, Meta>[],
  repeat: number,
): string {
  validateRepeat(repeat)
  for (const entry of palette) {
    if (!Number.isFinite(entry.weight ?? 1) || (entry.weight ?? 1) < 0) {
      throw new RangeError(`Surface token "${entry.id}" weight must be finite and non-negative`)
    }
  }
  const chunks: string[] = []
  for (let r = 0; r < repeat; r++) {
    for (let i = 0; i < palette.length; i++) {
      const entry = palette[i]!
      const weight = Math.max(1, Math.floor(entry.weight ?? 1))
      for (let count = 0; count < weight; count++) {
        chunks.push(entry.glyph)
        chunks.push(' ')
      }
    }
  }
  return chunks.join('')
}

function glyphTokenId(glyph: string): string {
  const codePoints = Array.from(glyph, (char) => char.codePointAt(0)?.toString(16) ?? '0')
  return `glyph-${codePoints.join('-')}`
}

export function normalizeSurfacePalette(
  units: SurfaceGlyphUnits,
): readonly SurfacePaletteEntry<string, SurfaceShorthandMeta>[] {
  const counts = new Map<string, number>()
  const order: string[] = []

  for (let i = 0; i < units.length; i++) {
    const glyph = units[i]!
    if (!counts.has(glyph)) {
      counts.set(glyph, 0)
      order.push(glyph)
    }
    counts.set(glyph, (counts.get(glyph) ?? 0) + 1)
  }

  return order.map((glyph) => ({
    id: glyphTokenId(glyph),
    glyph,
    weight: counts.get(glyph),
    meta: EMPTY_META,
  }))
}

function prepareSurfaceFromPalette<TokenId extends string, Meta>(
  cacheKey: string,
  palette: readonly SurfacePaletteEntry<TokenId, Meta>[],
  repeat: number,
  font = WEFT_TEXT_FONT,
): PreparedSurfaceSource<TokenId, Meta> {
  if (palette.length === 0) {
    throw new Error(`Surface palette "${cacheKey}" cannot be empty`)
  }

  validateRepeat(repeat)
  const cached = preparedSurfaceCache.get(cacheKey)
  if (cached && cached.font === font && cached.repeat === repeat && cached.palette.length === palette.length &&
    palette.every((entry, i) => {
      const old = cached.palette[i]!
      return entry.id === old.id && entry.glyph === old.glyph &&
        (entry.weight ?? 1) === (old.weight ?? 1) && Object.is(entry.meta, old.meta)
    })) return cached.source as PreparedSurfaceSource<TokenId, Meta>

  const seenIds = new Set<string>()
  const seenGlyphs = new Set<string>()
  const glyphLookup = new Map<string, ResolvedSurfaceGlyph<TokenId, Meta>>()

  for (let i = 0; i < palette.length; i++) {
    const entry = palette[i]!
    if (!Number.isFinite(entry.weight ?? 1) || (entry.weight ?? 1) < 0) {
      throw new RangeError(`Surface token "${entry.id}" weight must be finite and non-negative`)
    }
    if (seenIds.has(entry.id)) {
      throw new Error(`Duplicate surface token id "${entry.id}" in ${cacheKey}`)
    }
    if (seenGlyphs.has(entry.glyph)) {
      throw new Error(`Duplicate surface glyph "${entry.glyph}" in ${cacheKey}`)
    }

    seenIds.add(entry.id)
    seenGlyphs.add(entry.glyph)
    glyphLookup.set(entry.glyph, {
      id: entry.id,
      glyph: entry.glyph,
      ordinal: i,
      meta: entry.meta,
    })
  }

  // Snapshot token definitions so mutating/replacing a palette cannot leave a stale lookup in the cache.
  // Metadata itself is caller-owned and compared by identity; replace it or release the key to revise it.
  const snapshot = palette.map((entry) => Object.freeze({ ...entry }))
  const text = buildWeightedPaletteStream(snapshot, repeat)
  const preparedSurface: PreparedSurfaceSource<TokenId, Meta> = {
    cacheKey,
    repeat,
    prepared: prepareCachedSurfaceText(
      cacheKey,
      text,
      font,
    ),
    palette: snapshot,
    glyphLookup,
  }

  preparedSurfaceCache.set(cacheKey, { font, repeat, palette: snapshot,
    source: preparedSurface as PreparedSurfaceSource<string, unknown> }, text.length)
  return preparedSurface
}

export function prepareSurfaceText(
  cacheKey: string,
  units: SurfaceGlyphUnits,
  repeat: number,
  font?: string,
): PreparedSurfaceSource<string, SurfaceShorthandMeta>
export function prepareSurfaceText<TokenId extends string, Meta>(
  cacheKey: string,
  palette: readonly SurfacePaletteEntry<TokenId, Meta>[],
  repeat: number,
  font?: string,
): PreparedSurfaceSource<TokenId, Meta>
export function prepareSurfaceText<TokenId extends string, Meta>(
  cacheKey: string,
  paletteOrUnits: SurfaceGlyphUnits | readonly SurfacePaletteEntry<TokenId, Meta>[],
  repeat: number,
  font = WEFT_TEXT_FONT,
): PreparedSurfaceSource<string, SurfaceShorthandMeta> | PreparedSurfaceSource<TokenId, Meta> {
  if (paletteOrUnits.length === 0 || typeof paletteOrUnits[0] === 'string') {
    return prepareSurfaceFromPalette(
      cacheKey,
      normalizeSurfacePalette(paletteOrUnits as SurfaceGlyphUnits),
      repeat,
      font,
    )
  }

  return prepareSurfaceFromPalette(
    cacheKey,
    paletteOrUnits as readonly SurfacePaletteEntry<TokenId, Meta>[],
    repeat,
    font,
  )
}

export function prepareSemanticSurfaceText<TokenId extends string, Meta>(
  cacheKey: string,
  palette: readonly SurfacePaletteEntry<TokenId, Meta>[],
  repeat: number,
  font = WEFT_TEXT_FONT,
): PreparedSurfaceSource<TokenId, Meta> {
  return prepareSurfaceFromPalette(cacheKey, palette, repeat, font)
}

type SeedIndex = {
  checkpoints: BoundedCache<number, LayoutCursor>
  requested: BoundedCache<number, LayoutCursor>
  frontier: LayoutCursor
  advance: number
  period: number | null
}
let seedIndexes = new WeakMap<PreparedTextWithSegments, SeedIndex>()
let seedLayoutSteps = 0
let seedCacheHits = 0

export function clearSeedCursorCache(): void {
  seedIndexes = new WeakMap()
  seedLayoutSteps = seedCacheHits = 0
}

export function getSeedCursorStats() { return { layoutSteps: seedLayoutSteps, cacheHits: seedCacheHits } }

function copyCursor(cursor: LayoutCursor): LayoutCursor {
  return { segmentIndex: cursor.segmentIndex, graphemeIndex: cursor.graphemeIndex }
}

/** Bounded checkpoints plus a discovered rewind period; custom SeedCursorFactory callbacks are untouched. */
export function seedCursor(prepared: PreparedTextWithSegments, advance: number): LayoutCursor {
  if (!Number.isFinite(advance) || advance > Number.MAX_SAFE_INTEGER) throw new RangeError('Seed advance must be finite and safe')
  const requested = Math.max(0, Math.ceil(advance))
  let index = seedIndexes.get(prepared)
  if (!index) {
    index = { checkpoints: new BoundedCache(1024), requested: new BoundedCache(256),
      frontier: { segmentIndex: 0, graphemeIndex: 0 }, advance: 0, period: null }
    seedIndexes.set(prepared, index)
  }
  const target = index.period === null ? requested : requested % index.period
  const cached = index.requested.get(target)
  if (cached) { seedCacheHits++; return copyCursor(cached) }
  let at = 0
  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
  if (index.advance <= target) {
    at = index.advance
    cursor = copyCursor(index.frontier)
  } else {
    at = Math.floor(target / 32) * 32
    const checkpoint = index.checkpoints.get(at)
    if (checkpoint) cursor = copyCursor(checkpoint)
    else at = 0
  }
  for (; at < target; at++) {
    const line = layoutSurfaceNextLine(prepared, cursor, 400)
    seedLayoutSteps++
    if (line === null) {
      index.period = at + 1
      return seedCursor(prepared, requested)
    }
    cursor = copyCursor(line.end)
    if ((at + 1) % 32 === 0) index.checkpoints.set(at + 1, copyCursor(cursor))
    if (at + 1 > index.advance) {
      index.advance = at + 1
      index.frontier = copyCursor(cursor)
    }
  }
  index.requested.set(target, copyCursor(cursor))
  return copyCursor(cursor)
}
