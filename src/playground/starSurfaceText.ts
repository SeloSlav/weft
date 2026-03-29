import {
  prepareSurfaceText,
  type PreparedSurfaceSource,
  SURFACE_TEXT_FONT,
} from '../skinText'

const STAR_UNITS = [
  '·',
  '•',
  '⋆',
  '✦',
  '✧',
  '∗',
  '⭑',
  '·',
  '•',
  '·',
] as const

export function getPreparedStarSurface(): PreparedSurfaceSource {
  return prepareSurfaceText(
    'star-sky-surface',
    STAR_UNITS,
    36,
    SURFACE_TEXT_FONT,
  )
}
