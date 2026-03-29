/**
 * Runtime quality presets for the playground: tune layout density, DPR, and update cadence
 * without changing the Weft source → layout → effect model.
 */
export type PlaygroundQuality = 'low' | 'medium' | 'high'

export const PLAYGROUND_QUALITY_DEFAULT: PlaygroundQuality = 'low'

export function getQualityPixelRatioCap(quality: PlaygroundQuality): number {
  switch (quality) {
    case 'low':
      return 1
    case 'medium':
      return Math.min(1.5, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1.5)
    case 'high':
      return Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 2)
    default:
      return 2
  }
}

/** Multiplier applied to grass layout density (relative to current param). */
export function getQualityGrassLayoutScale(quality: PlaygroundQuality): number {
  switch (quality) {
    case 'low':
      return 0.32
    case 'medium':
      return 0.68
    case 'high':
      return 1
    default:
      return 1
  }
}

/** Star sky layout density scale. */
export function getQualityStarLayoutScale(quality: PlaygroundQuality): number {
  switch (quality) {
    case 'low':
      return 0.5
    case 'medium':
      return 0.78
    case 'high':
      return 1
    default:
      return 1
  }
}

/** Rock field layout density scale. */
export function getQualityRockLayoutScale(quality: PlaygroundQuality): number {
  switch (quality) {
    case 'low':
      return 0.6
    case 'medium':
      return 0.82
    case 'high':
      return 1
    default:
      return 1
  }
}
