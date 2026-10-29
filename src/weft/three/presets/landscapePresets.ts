import { DEFAULT_GRASS_FIELD_PARAMS, type GrassFieldParams } from './grassField'
import { DEFAULT_ROCK_FIELD_PARAMS, type RockFieldParams } from './rockField'
import { DEFAULT_SHRUB_FIELD_PARAMS, type ShrubFieldParams } from './shrubField'
import { DEFAULT_TREE_FIELD_PARAMS, type TreeFieldParams } from './treeField'
import { DEFAULT_LEAF_PILE_BAND_PARAMS, type LeafPileBandParams } from './leafPileBand'

export type LandscapePreset = {
  name: string
  description: string
  grass: GrassFieldParams
  rocks: RockFieldParams
  shrubs: ShrubFieldParams
  trees: TreeFieldParams
  leafPile: LeafPileBandParams
}

/** Coordinated, ready-to-spread SDK parameters. Densities use SDK units, with no demo scaling. */
export const LANDSCAPE_PRESETS = {
  meadow: {
    name: 'Open meadow',
    description: 'Soft green tufts, scattered stone and a few broad crowns. Room for the ground cover to breathe.',
    grass: { ...DEFAULT_GRASS_FIELD_PARAMS, layoutDensity: 3.8, bladeWidthScale: 2.1, bladeHeightScale: 1.15, wind: 0.48, colorSeason: 'summer' },
    rocks: { ...DEFAULT_ROCK_FIELD_PARAMS, layoutDensity: 0.3, sizeScale: 1.8 },
    shrubs: { ...DEFAULT_SHRUB_FIELD_PARAMS, layoutDensity: 0.12, sizeScale: 1.6, heightScale: 1.5 },
    trees: { ...DEFAULT_TREE_FIELD_PARAMS, layoutDensity: 0.075, sizeScale: 1.45, heightScale: 1.3, crownScale: 1.5 },
    leafPile: { ...DEFAULT_LEAF_PILE_BAND_PARAMS, layoutDensity: 0.08, sizeScale: 0.85, bandWidth: 1.2, season: 'summer' },
  },
  woodland: {
    name: 'Fern glade',
    description: 'Layered emerald undergrowth, rounded canopies and warm stone, with open space between trunks.',
    grass: { ...DEFAULT_GRASS_FIELD_PARAMS, layoutDensity: 3.36, bladeWidthScale: 1.8, bladeHeightScale: 0.95, wind: 0.3, colorSeason: 'spring' },
    rocks: { ...DEFAULT_ROCK_FIELD_PARAMS, layoutDensity: 0.6, sizeScale: 2.3 },
    shrubs: { ...DEFAULT_SHRUB_FIELD_PARAMS, layoutDensity: 0.32, sizeScale: 1.85, heightScale: 2.1 },
    trees: { ...DEFAULT_TREE_FIELD_PARAMS, layoutDensity: 0.24, sizeScale: 1.6, heightScale: 1.55, crownScale: 1.3 },
    leafPile: { ...DEFAULT_LEAF_PILE_BAND_PARAMS, layoutDensity: 0.14, sizeScale: 1.15, bandWidth: 2.1, season: 'spring' },
  },
  autumn: {
    name: 'Amber woodland',
    description: 'Copper foliage over low golden grass and curled leaf litter. A warm, quieter forest floor.',
    grass: { ...DEFAULT_GRASS_FIELD_PARAMS, layoutDensity: 2.4, bladeWidthScale: 1.9, bladeHeightScale: 0.82, wind: 0.23, colorSeason: 'autumn' },
    rocks: { ...DEFAULT_ROCK_FIELD_PARAMS, layoutDensity: 0.48, sizeScale: 2.1 },
    shrubs: { ...DEFAULT_SHRUB_FIELD_PARAMS, layoutDensity: 0.22, sizeScale: 1.65, heightScale: 1.8 },
    trees: { ...DEFAULT_TREE_FIELD_PARAMS, layoutDensity: 0.19, sizeScale: 1.55, heightScale: 1.4, crownScale: 1.35 },
    leafPile: { ...DEFAULT_LEAF_PILE_BAND_PARAMS, layoutDensity: 0.2, sizeScale: 1.4, bandWidth: 3.4, season: 'autumn' },
  },
} satisfies Record<string, LandscapePreset>

export type LandscapePresetId = keyof typeof LANDSCAPE_PRESETS
