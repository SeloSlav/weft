import type { MovementBounds, ThirdPersonControllerConfig } from './thirdPersonController'
export const PLAYGROUND_BOUNDS: MovementBounds = {
  minX: -28,
  maxX: 28,
  minZ: -28,
  maxZ: 28,
}

export const PLAYGROUND_CONTROLLER: ThirdPersonControllerConfig = {
  moveSpeed: 5.7,
  sprintMultiplier: 1.5,
  jumpVelocity: 6.1,
  gravity: 15.5,
  turnLerp: 10,
  lookYawSpeed: 0.008,
  lookPitchSpeed: 0.006,
  minPitch: -0.82,
  maxPitch: 0.34,
  cameraDistance: 6.7,
  cameraHeight: 2.45,
  shoulderOffset: 0.7,
  reticleDistance: 10.2,
  cameraFollowLerp: 10,
}

export const PLAYGROUND_ZOOM = {
  min: 4.8,
  max: 25,
  current: 6.7,
}

export const PLAYGROUND_SPAWN = {
  x: 0,
  z: 10.5,
  yaw: 0,
  pitch: -0.22,
}

/** Shutter-style facade on the north building, facing the intersection. */
export const SHUTTER_WALL_LAYOUT = {
  x: 0,
  z: -15.02,
  wallCenterHeight: 2.45,
  wallWidth: 8.8,
  wallHeight: 7.2,
  wallDepth: 0.85,
}

/** Ivy-covered wall on the west building, facing +X. */
export const IVY_WALL_LAYOUT = {
  x: -12.5,
  z: 2,
  wallCenterHeight: 2.35,
  wallWidth: 8.2,
  wallHeight: 6.5,
  wallDepth: 0.85,
}

export const WINDOW_GLASS_LAYOUTS = [
  { x: -5.6, y: 5.3, z: -15.02, rotationY: 0, scaleX: 0.84, scaleY: 0.9, scaleZ: 0.12 },
  { x: 5.6, y: 5.3, z: -15.02, rotationY: 0, scaleX: 0.84, scaleY: 0.9, scaleZ: 0.12 },
  // East building: nudge x slightly more −X so glass sits a bit further off the façade than 12.74.
  { x: 12.64, y: 4.4, z: -6.2, rotationY: -Math.PI / 2, scaleX: 0.72, scaleY: 0.86, scaleZ: 0.12 },
  { x: 12.64, y: 4.4, z: -1.6, rotationY: -Math.PI / 2, scaleX: 0.72, scaleY: 0.86, scaleZ: 0.12 },
] as const

export const INTERIOR_FLOOR_Y = 0.14

const BUILDING_INTERIORS = [
  { minX: -12.74, maxX: 12.74, minZ: -23.49, maxZ: -15.51 },
  { minX: -20.49, maxX: -12.51, minZ: -4.74, maxZ: 8.74 },
  { minX: 12.76, maxX: 21.24, minZ: -9.74, maxZ: 1.74 },
] as const

export function isInsideBuildingInterior(x: number, z: number): boolean {
  return BUILDING_INTERIORS.some((interior) =>
    x >= interior.minX && x <= interior.maxX && z >= interior.minZ && z <= interior.maxZ,
  )
}

/** Keep only the south neon wall segment on the open side with no building behind it. */
export const NEON_BARRIERS = [
  { x: 0, z: 9, rotationY: 0, wallWidth: 18, wallHeight: 6.6 },
] as const

/** Rubble / fracture field: empty lot beside the road. */
export const RUBBLE_ZONE = {
  minX: 6,
  maxX: 18.5,
  minZ: 4,
  maxZ: 17,
}

export function isInsideRubbleZone(x: number, z: number): boolean {
  return x >= RUBBLE_ZONE.minX && x <= RUBBLE_ZONE.maxX && z >= RUBBLE_ZONE.minZ && z <= RUBBLE_ZONE.maxZ
}

/** Sum of wound strengths (each capped 1) before the lamp reads as fully broken; heals with fish-scale recovery. */
export const STREET_LAMP_GLASS_BREAK_THRESHOLD = 3.65

export const STREET_LAMP_POINT_INTENSITY_MAX = 2.35

/** Globe material emissive intensity when the lamp is intact. */
export const STREET_LAMP_GLOBE_EMISSIVE_MAX = 0.88

/** Shared glass tuning for lamps and building windows. */
export const DEFAULT_GLASS_SURFACE_PARAMS = {
  woundRadius: 1.4,
  woundNarrow: 0.2,
  woundDepth: 0.62,
  scaleLift: 0.48,
  surfaceFlex: 0.22,
  recoveryRate: 0,
} as const
