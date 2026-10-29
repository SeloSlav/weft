export type RecoveringImpact = {
  strength: number
}

export function decayRecoveringStrength(strength: number, recoveryRate: number, delta: number): number {
  if (!Number.isFinite(strength) || !Number.isFinite(recoveryRate) || !Number.isFinite(delta)) {
    throw new RangeError('Recovery inputs must be finite')
  }
  if (delta <= 0 || strength <= 0 || recoveryRate <= 0) return strength
  // Integrate ds/dt = -rate * (0.22 + 2.35 * (1 - clamp(s, 0, 1))^2).
  // This preserves the authored accelerating recovery curve across different update cadences.
  if (strength > 1) {
    const aboveOneTime = (strength - 1) / (recoveryRate * 0.22)
    if (delta <= aboveOneTime) return strength - recoveryRate * 0.22 * delta
    delta -= aboveOneTime
    strength = 1
  }
  const scale = Math.sqrt(2.35 / 0.22)
  const angle = Math.atan((1 - strength) * scale) + recoveryRate * Math.sqrt(0.22 * 2.35) * delta
  return angle >= Math.atan(scale) ? 0 : Math.max(0, 1 - Math.tan(angle) / scale)
}

export function updateRecoveringImpacts<T extends RecoveringImpact>(
  impacts: T[],
  recoveryRate: number,
  delta: number,
  removeThreshold = 0.015,
): void {
  if (delta <= 0 || impacts.length === 0) return
  if (recoveryRate <= 0) return

  let write = 0
  for (let i = 0; i < impacts.length; i++) {
    const impact = impacts[i]!
    impact.strength = decayRecoveringStrength(impact.strength, recoveryRate, delta)
    if (impact.strength > removeThreshold) impacts[write++] = impact
  }
  impacts.length = write
}
