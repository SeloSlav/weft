export type SampleId = 'torus-wound' | 'plane-ribbon'

export type SampleMeta = {
  id: SampleId
  title: string
  description: string
}

export const SAMPLE_LIST: readonly SampleMeta[] = [
  {
    id: 'torus-wound',
    title: 'Torus + wound',
    description:
      'Contour bands on a deforming torus: each sector’s arc length becomes Pretext layout width. A wound narrows that width; it drifts only while body deformation is on—at 0 the layout field is static (Pretext is deterministic; changing widths every frame was what looked like “vibration”).',
  },
  {
    id: 'plane-ribbon',
    title: 'Plane ribbons',
    description:
      'Flat ribbons along X with multiple Z bands—like lines on a page. An obstacle shrinks available width; it drifts only while surface wave is on—at 0 the obstacle stays fixed so layout stops thrashing.',
  },
] as const
