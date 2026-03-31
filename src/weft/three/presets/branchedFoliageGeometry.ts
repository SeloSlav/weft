import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { makeLeafPileLeafGeometry } from './leafPileLeafGeometry'

const LEAF_TEMPLATE = makeLeafPileLeafGeometry()

const _bA = new THREE.Vector3()
const _bB = new THREE.Vector3()
const _bMid = new THREE.Vector3()
const _bDir = new THREE.Vector3()
const _bAxis = new THREE.Vector3()
const _bQuat = new THREE.Quaternion()
const _bY = new THREE.Vector3(0, 1, 0)
const _bScale = new THREE.Vector3(1, 1, 1)
const _bMat = new THREE.Matrix4()
const _bUp = new THREE.Vector3(0, 1, 0)
const _forkAxis = new THREE.Vector3()
const _leafTanU = new THREE.Vector3()
const _leafTanV = new THREE.Vector3()

function disposeGeometryList(geoms: THREE.BufferGeometry[]): void {
  for (const g of geoms) g.dispose()
}

function pushCylinderBetween(
  out: THREE.BufferGeometry[],
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  r0: number,
  r1: number,
): void {
  _bA.set(ax, ay, az)
  _bB.set(bx, by, bz)
  _bMid.addVectors(_bA, _bB).multiplyScalar(0.5)
  const len = _bA.distanceTo(_bB)
  if (len < 1e-5) return
  const cyl = new THREE.CylinderGeometry(r0, r1, len, 5, 1)
  _bDir.subVectors(_bB, _bA).normalize()
  _bQuat.setFromUnitVectors(_bY, _bDir)
  _bMat.compose(_bMid, _bQuat, _bScale)
  cyl.applyMatrix4(_bMat)
  out.push(cyl)
}

function pushLeafCluster(
  out: THREE.BufferGeometry[],
  cx: number,
  cy: number,
  cz: number,
  outward: THREE.Vector3,
  spread: number,
): void {
  const n = outward.clone()
  if (n.lengthSq() < 1e-8) n.set(0, 1, 0)
  else n.normalize()

  const base = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n)
  const scale = 0.152 * spread

  _leafTanU.crossVectors(n, _bUp)
  if (_leafTanU.lengthSq() < 1e-5) _leafTanU.set(1, 0, 0)
  else _leafTanU.normalize()
  _leafTanV.crossVectors(n, _leafTanU)
  if (_leafTanV.lengthSq() < 1e-5) _leafTanV.set(0, 0, 1)
  else _leafTanV.normalize()

  const rings = 6
  const jitter = [
    [0, 0],
    [0.08, -0.06],
    [-0.07, 0.07],
    [0.06, 0.08],
    [-0.08, -0.05],
    [0.05, -0.07],
  ]
  for (let r = 0; r < rings; r++) {
    const ringYaw = r * ((Math.PI * 2) / rings) + (r % 3) * 0.12
    const [jx, jy] = jitter[r % jitter.length]!
    const px = cx + _leafTanU.x * jx + _leafTanV.x * jy
    const py = cy + _leafTanU.y * jx + _leafTanV.y * jy
    const pz = cz + _leafTanU.z * jx + _leafTanV.z * jy
    const s = scale * (0.88 + (r % 4) * 0.04)
    for (let i = 0; i < 2; i++) {
      const g = LEAF_TEMPLATE.clone()
      const q = base.clone().multiply(
        new THREE.Quaternion().setFromAxisAngle(n, ringYaw + i * Math.PI * 0.5 + 0.15),
      )
      const m = new THREE.Matrix4().compose(new THREE.Vector3(px, py, pz), q, new THREE.Vector3(s, s, s))
      g.applyMatrix4(m)
      out.push(g)
    }
  }
}

export type BranchedFoliageProfile = {
  /** Ground trunk cylinder (shrubs); false = crown-only for trees (origin at trunk top). */
  includeTrunk: boolean
  trunkH: number
  trunkR0: number
  trunkR1: number
  primaryN: number
  primaryLen: number
  primaryR0: number
  primaryR1: number
  subR0: number
  subR1: number
  /** Extra leaf cluster scale at tips / along branches. */
  leafSpreadMul: number
}

const SHRUB_PROFILE: BranchedFoliageProfile = {
  includeTrunk: true,
  trunkH: 0.2,
  trunkR0: 0.084,
  trunkR1: 0.055,
  primaryN: 6,
  primaryLen: 0.36,
  primaryR0: 0.032,
  primaryR1: 0.019,
  subR0: 0.017,
  subR1: 0.009,
  leafSpreadMul: 1,
}

/** Taller, more branches; no ground trunk — sits on tree cylinder trunk top. */
const TREE_CROWN_PROFILE: BranchedFoliageProfile = {
  includeTrunk: false,
  trunkH: 0,
  trunkR0: 0,
  trunkR1: 0,
  primaryN: 8,
  primaryLen: 0.58,
  primaryR0: 0.038,
  primaryR1: 0.022,
  subR0: 0.02,
  subR1: 0.011,
  leafSpreadMul: 1.08,
}

/**
 * Shared shrub / small-tree canopy: tapered wood, dense leaf-pile silhouettes.
 * Local Y up; shrubs use ground y=0, tree crowns use y=0 at trunk attachment.
 */
export function makeBranchedFoliageGeometries(profile: BranchedFoliageProfile): {
  wood: THREE.BufferGeometry
  leaves: THREE.BufferGeometry
} {
  const wood: THREE.BufferGeometry[] = []
  const leaves: THREE.BufferGeometry[] = []
  const m = profile.leafSpreadMul

  if (profile.includeTrunk) {
    pushCylinderBetween(wood, 0, 0, 0, 0, profile.trunkH, 0, profile.trunkR0, profile.trunkR1)
  }

  const trunkTop = profile.includeTrunk ? profile.trunkH * 0.92 : 0
  const primaryN = profile.primaryN
  const primaryLen = profile.primaryLen

  if (profile.includeTrunk) {
    for (let ring = 0; ring < 10; ring++) {
      const a = (ring / 10) * Math.PI * 2 + 0.2
      const rx = Math.cos(a) * 0.07
      const rz = Math.sin(a) * 0.07
      const py = trunkTop * 0.96
      const out = new THREE.Vector3(rx, 0.22, rz).normalize()
      pushLeafCluster(leaves, rx, py, rz, out, 0.72 * m)
    }
  } else {
    for (let ring = 0; ring < 14; ring++) {
      const a = (ring / 14) * Math.PI * 2 + 0.15
      const rx = Math.cos(a) * 0.06
      const rz = Math.sin(a) * 0.06
      const py = 0.03
      const out = new THREE.Vector3(rx, 0.42, rz).normalize()
      pushLeafCluster(leaves, rx, py, rz, out, 0.78 * m)
    }
  }

  const primaryTips: THREE.Vector3[] = []

  for (let i = 0; i < primaryN; i++) {
    const theta = (i / primaryN) * Math.PI * 2 + 0.41
    const elev = 0.38 + Math.sin(i * 1.7 + 0.3) * 0.08
    const horiz = Math.cos(elev)
    _bDir.set(Math.cos(theta) * horiz, Math.sin(elev), Math.sin(theta) * horiz).normalize()

    const sx = _bDir.x * primaryLen * 0.06
    const sz = _bDir.z * primaryLen * 0.06
    const bx = sx + _bDir.x * primaryLen
    const by = trunkTop + _bDir.y * primaryLen
    const bz = sz + _bDir.z * primaryLen
    pushCylinderBetween(wood, sx, trunkTop, sz, bx, by, bz, profile.primaryR0, profile.primaryR1)
    primaryTips.push(new THREE.Vector3(bx, by, bz))

    for (const frac of [0.26, 0.42, 0.58, 0.74]) {
      const px = sx + _bDir.x * primaryLen * frac
      const py = trunkTop + _bDir.y * primaryLen * frac
      const pz = sz + _bDir.z * primaryLen * frac
      const out = new THREE.Vector3(px, py, pz).normalize()
      pushLeafCluster(leaves, px, py, pz, out, (0.82 + frac * 0.12) * m)
    }

    _forkAxis.crossVectors(_bDir, _bUp)
    if (_forkAxis.lengthSq() < 1e-4) _forkAxis.set(1, 0, 0)
    else _forkAxis.normalize()

    for (let s = 0; s < 2; s++) {
      const fork = s === 0 ? 0.52 : -0.48
      const t = 0.58 + s * 0.12
      const ox = sx + _bDir.x * primaryLen * t
      const oy = trunkTop + _bDir.y * primaryLen * t
      const oz = sz + _bDir.z * primaryLen * t

      const subDir = _bDir.clone().applyAxisAngle(_forkAxis, fork + (s - 0.5) * 0.12).normalize()
      const subLen = primaryLen * (0.48 + (s === 0 ? 0.06 : 0))
      const ex = ox + subDir.x * subLen
      const ey = oy + subDir.y * subLen
      const ez = oz + subDir.z * subLen
      pushCylinderBetween(wood, ox, oy, oz, ex, ey, ez, profile.subR0, profile.subR1)

      const midx = (ox + ex) * 0.5
      const midy = (oy + ey) * 0.5
      const midz = (oz + ez) * 0.5
      const outMid = new THREE.Vector3(midx, midy, midz).normalize()
      pushLeafCluster(leaves, midx, midy, midz, outMid, 0.78 * m)

      _bAxis.crossVectors(subDir, _bUp)
      if (_bAxis.lengthSq() < 1e-5) _bAxis.set(1, 0, 0)
      else _bAxis.normalize()
      const twigDir = subDir.clone().applyAxisAngle(_bAxis, 0.35 + s * 0.1).normalize()
      const twLen = subLen * 0.42
      const tx = ex + twigDir.x * twLen * 0.35
      const ty = ey + twigDir.y * twLen * 0.35
      const tz = ez + twigDir.z * twLen * 0.35
      pushCylinderBetween(wood, ex, ey, ez, tx, ty, tz, profile.subR1 * 0.9, profile.subR1 * 0.45)

      const tip = new THREE.Vector3(tx, ty, tz)
      const out = tip.clone().normalize()
      pushLeafCluster(leaves, tip.x, tip.y, tip.z, out, (1.02 + s * 0.06) * m)

      const micro = twigDir.clone().multiplyScalar(0.14)
      pushLeafCluster(leaves, ex + micro.x * 0.5, ey + micro.y * 0.5, ez + micro.z * 0.5, out, 0.88 * m)
    }

    const mid = new THREE.Vector3(sx, trunkTop, sz).add(
      new THREE.Vector3(_bDir.x, _bDir.y, _bDir.z).multiplyScalar(primaryLen * 0.88),
    )
    const outEnd = mid.clone().normalize()
    pushLeafCluster(leaves, mid.x, mid.y, mid.z, outEnd, 0.92 * m)
  }

  for (let i = 0; i < primaryN; i++) {
    const tip = primaryTips[i]!
    const out = tip.clone().normalize()
    pushLeafCluster(leaves, tip.x, tip.y, tip.z, out, 0.98 * m)
  }

  const mergedWood = mergeGeometries(wood)
  const mergedLeaves = mergeGeometries(leaves)
  disposeGeometryList(wood)
  disposeGeometryList(leaves)

  if (!mergedWood || !mergedLeaves) {
    mergedWood?.dispose()
    mergedLeaves?.dispose()
    return {
      wood: new THREE.CylinderGeometry(0.1, 0.12, 0.25, 5, 1),
      leaves: makeLeafPileLeafGeometry(),
    }
  }

  mergedWood.computeVertexNormals()
  mergedLeaves.computeVertexNormals()
  return { wood: mergedWood, leaves: mergedLeaves }
}

export function makeShrubBranchedGeometries(): {
  wood: THREE.BufferGeometry
  leaves: THREE.BufferGeometry
} {
  return makeBranchedFoliageGeometries(SHRUB_PROFILE)
}

/** Canonical vertical extent of tree-crown local mesh (for scaling to `crownHeight`). */
export const TREE_CROWN_LOCAL_EXTENT_Y = 0.72

export function makeTreeCrownBranchedGeometries(): {
  wood: THREE.BufferGeometry
  leaves: THREE.BufferGeometry
} {
  return makeBranchedFoliageGeometries(TREE_CROWN_PROFILE)
}
