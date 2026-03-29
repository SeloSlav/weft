import type { PreparedSurfaceSource, ResolvedSurfaceGlyph } from '../../core'
import { prepareCachedSurfaceText } from '../../core'
import { graphemesOf } from '../../../samples/graphemes'

export type BookGlyphMeta = {
  ordinal: number
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
