import type { PreparedSurfaceSource, ResolvedSurfaceGlyph } from '../../core'
import { prepareCachedSurfaceText } from '../../core'
import { graphemesOf } from '../../../samples/graphemes'

export type BookGlyphMeta = {
  ordinal: number
}

export type PortableBookPageSurface = PreparedSurfaceSource<string, BookGlyphMeta> & {
  readonly portableBook: { readonly tokens: readonly string[]; readonly tokenAdvance: number; readonly spaceAdvance: number }
}

/** Caller-supplied glyph tokens avoid platform Unicode segmentation and font-dependent wrapping. */
export function createPortableBookPageSurface(
  cacheKey: string, tokens: readonly string[], options: { tokenAdvance?: number; spaceAdvance?: number } = {},
): PortableBookPageSurface {
  const tokenAdvance = options.tokenAdvance ?? 12
  const spaceAdvance = options.spaceAdvance ?? 6
  if (!Number.isFinite(tokenAdvance) || tokenAdvance <= 0 || !Number.isFinite(spaceAdvance) || spaceAdvance <= 0) {
    throw new RangeError('Portable book advances must be finite and positive')
  }
  for (const token of tokens) {
    if (!token || (token !== ' ' && token !== '\n' && /\s/u.test(token))) {
      throw new Error('Portable book tokens must be nonempty glyphs, spaces, or newline tokens')
    }
  }
  const copied = tokens.slice()
  const unique = [...new Set(copied)]
  const palette = unique.map((glyph, ordinal) => ({ id: `book-${cacheKey}-${ordinal}`, glyph, meta: { ordinal } }))
  const glyphLookup = new Map<string, ResolvedSurfaceGlyph<string, BookGlyphMeta>>()
  for (const entry of palette) glyphLookup.set(entry.glyph, { ...entry, ordinal: entry.meta.ordinal })
  return { cacheKey, prepared: prepareCachedSurfaceText(cacheKey, copied.join('')), palette, glyphLookup,
    portableBook: { tokens: copied, tokenAdvance, spaceAdvance } }
}

/**
 * Build a measured surface whose prepared text is the literal page prose (not a repeated palette stream).
 * Palette entries cover every unique grapheme so layout can resolve glyphs.
 */
export function createBookPageSurface(
  cacheKey: string,
  pageText: string,
): PreparedSurfaceSource<string, BookGlyphMeta> {
  const prepared = prepareCachedSurfaceText(cacheKey, pageText)
  const unique: string[] = []
  const seen = new Set<string>()
  for (const g of graphemesOf(pageText)) {
    if (!seen.has(g)) {
      seen.add(g)
      unique.push(g)
    }
  }
  const palette = unique.map((glyph, ordinal) => ({
    id: `book-${cacheKey}-${ordinal}`,
    glyph,
    meta: { ordinal },
  }))
  const glyphLookup = new Map<string, ResolvedSurfaceGlyph<string, BookGlyphMeta>>()
  for (const entry of palette) {
    glyphLookup.set(entry.glyph, {
      id: entry.id,
      glyph: entry.glyph,
      ordinal: entry.meta.ordinal,
      meta: entry.meta,
    })
  }
  return {
    cacheKey,
    prepared,
    palette,
    glyphLookup,
  }
}
