export {
  buildRepeatedUnitStream,
  clearSeedCursorCache,
  clearSurfaceCaches,
  configureSurfaceCaches,
  getSeedCursorStats,
  getSurfaceCacheStats,
  releaseSurfaceSource,
  buildWeightedPaletteStream,
  normalizeSurfacePalette,
  prepareCachedSurfaceText,
  prepareSemanticSurfaceText,
  prepareSurfaceText,
  seedCursor,
  WEFT_TEXT_FONT,
} from './text'
export type {
  PreparedSurfaceSource,
  ResolvedSurfaceGlyph,
  SeedCursorFactory,
  SurfaceGlyphUnits,
  SurfacePaletteEntry,
  SurfaceShorthandMeta,
  SurfaceCacheOptions,
} from './text'

export { SurfaceLayoutDriver, createBandSeeds } from './layout'
export type { LayoutTraversalOptions, SurfaceLayoutDriverOptions, SurfaceLayoutStats, SurfaceLayoutLine, SurfaceLayoutSlot } from './layout'
export type { CacheStats } from './cache'

export {
  createFbmField,
  createValueNoiseField,
  createWorldField,
  domainWarpField,
  hash01,
  remapField,
  ridgeField,
  thresholdField,
} from './worldField'
export type {
  CreateWorldFieldOptions,
  DomainWarpFieldOptions,
  FbmFieldOptions,
  RemapFieldOptions,
  ThresholdFieldOptions,
  ValueNoiseFieldOptions,
  WorldField2,
} from './worldField'
