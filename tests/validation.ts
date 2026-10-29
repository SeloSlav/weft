import * as THREE from 'three'
import { WebGPURenderer } from 'three/webgpu'
import * as sdk from '../src/weft/three'
import { SurfaceLayoutDriver, seedCursor, createWorldField } from '../src/weft/core'
import { updateActiveAttribute } from '../src/weft/three/helpers/bufferUpdates'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const output = $<HTMLPreElement>('results')
const renderer = new WebGPURenderer({ canvas: $<HTMLCanvasElement>('scene'), antialias: true })
await renderer.init()
renderer.setSize(960, 540, false)
renderer.setPixelRatio(1)
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.1
const scene = new THREE.Scene()
scene.background = new THREE.Color('#b8cacc')
scene.fog = new THREE.Fog('#b8cacc', 24, 75)
scene.add(new THREE.HemisphereLight('#d4e8ff', '#6b6445', 2))
const sun = new THREE.DirectionalLight('#fff0cd', 3)
sun.position.set(-7, 12, 5)
scene.add(sun)
const camera = new THREE.PerspectiveCamera(48, 960 / 540, 0.1, 120)
const bounds = { minX: -20, maxX: 20, minZ: -20, maxZ: 20 }
let signal = createWorldField(17, { scale: 12, warpAmplitude: 3 })
const grass = sdk.createGrassEffect({ seedCursor, initialParams: sdk.LANDSCAPE_PRESETS.woodland.grass,
  placementMask: { bounds, coverageMultiplierAtXZ: (x, z) => 0.35 + signal(x, z) * 0.65 } })
const trees = sdk.createTreeFieldEffect({ seedCursor, initialParams: sdk.LANDSCAPE_PRESETS.woodland.trees,
  placementMask: { bounds, includeAtXZ: (x, z) => z < 0 && Math.hypot(x, z) > 7 && signal(x, z) > 0.48 } })
const shrubs = sdk.createShrubFieldEffect({ seedCursor, initialParams: sdk.LANDSCAPE_PRESETS.woodland.shrubs,
  placementMask: { bounds, includeAtXZ: (x, z) => Math.hypot(x - 2, z - 4) > 4 && signal(x, z) > 0.6 } })
const rocks = sdk.createRockFieldEffect({ seedCursor, initialParams: sdk.LANDSCAPE_PRESETS.woodland.rocks,
  placementMask: { bounds, includeAtXZ: (x, z) => signal(x + 11, z + 8) > 0.7 } })
scene.add(grass.group, trees.group, shrubs.group, rocks.group)
const ground = (x: number, z: number) => grass.getGroundHeightAtWorld(x, z)
let elapsed = 2
let paused = true
let renderDirty = true
let last = performance.now()
const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>()
let diagnostics: THREE.Material[] = []
function setDiagnostic() {
  renderDirty = true
  for (const [mesh, material] of originals) mesh.material = material
  originals.clear()
  for (const material of diagnostics) material.dispose()
  diagnostics = []
  const mode = $<HTMLSelectElement>('debug').value
  if (mode === 'final') return
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh || mesh === grass.interactionMesh) return
    originals.set(mesh, mesh.material)
    const material = new THREE.MeshBasicMaterial({color: '#b7cc9d', wireframe: mode === 'wireframe', vertexColors: mode === 'color', side: THREE.DoubleSide})
    diagnostics.push(material)
    mesh.material = material
  })
}
function reset() {
  renderDirty = true
  signal = createWorldField(Number($<HTMLSelectElement>('seed').value), { scale: 12, warpAmplitude: 3 })
  setDiagnostic()
  const preset = sdk.LANDSCAPE_PRESETS[$<HTMLSelectElement>('preset').value as sdk.LandscapePresetId]
  grass.clearBurns(); grass.clearDisturbances(); grass.setParams(preset.grass)
  grass.setSurface(sdk.getPreparedGrassSurface())
  trees.clearCrownBurns(); trees.setParams(preset.trees); trees.setSurface(sdk.buildTreeSeasonSurface(preset.leafPile.season), seedCursor)
  shrubs.clearBurns(); shrubs.setParams(preset.shrubs); shrubs.setSurface(sdk.buildShrubSeasonSurface(preset.leafPile.season), seedCursor)
  rocks.clearDestruction(); rocks.setParams(preset.rocks)
  elapsed = 2
  grass.update(elapsed); trees.update(elapsed, ground); shrubs.update(elapsed, ground); rocks.update(elapsed, ground)
}
function cameraBookmark() {
  renderDirty = true
  const view = $<HTMLSelectElement>('camera').value
  camera.position.set(...(view === 'near' ? [2, 1.3, 5] : view === 'far' ? [28, 17, 35] : [10, 6, 16]) as [number, number, number])
  camera.lookAt(0, view === 'near' ? 0.3 : 2, 0)
}
$('reset').onclick = reset
$('preset').onchange = reset
$('seed').onchange = reset
$('camera').onchange = cameraBookmark
$('debug').onchange = setDiagnostic
$('pause').onclick = () => { paused = !paused; renderDirty = true; $('pause').textContent = paused ? 'Play wind' : 'Pause wind' }
$('damage').onclick = () => {
  grass.addDisturbanceFromWorldPoint(new THREE.Vector3(2, 0, 4), {strength: 1})
  grass.addBurnFromWorldPoint(new THREE.Vector3(2, 0, 4))
  paused = false; $('pause').textContent = 'Pause wind'
}
reset(); cameraBookmark()
renderer.setAnimationLoop(() => {
  const now = performance.now()
  if (paused && !renderDirty) { last = now; return }
  if (!paused) elapsed += Math.min(0.05, (now - last) / 1000)
  last = now
  grass.update(elapsed); trees.update(elapsed, ground); shrubs.update(elapsed, ground); rocks.update(elapsed, ground)
  renderer.info.reset()
  renderer.render(scene, camera)
  $('metrics').textContent = `seed ${$<HTMLSelectElement>('seed').value} | time ${elapsed.toFixed(2)} s | draw calls ${renderer.info.render.drawCalls} | triangles ${renderer.info.render.triangles.toLocaleString()} | CPU benchmarks below do not measure GPU time`
  renderDirty = false
})

function assert(condition: unknown, message: string) { if (!condition) throw new Error(message) }
function instanced(effect: {group: THREE.Group}) {
  return effect.group.children.filter((child): child is THREE.InstancedMesh => Boolean((child as THREE.InstancedMesh).isInstancedMesh))
}
async function runChecks() {
  paused = true
  output.textContent = 'Running…'
  const lines: string[] = []
  const test = (name: string, action: () => void) => {
    try { action(); lines.push(`PASS ${name}`) } catch (error) { lines.push(`FAIL ${name}: ${error}`) }
    output.textContent = lines.join('\n')
  }
  test('exact-width layout cache preserves traversal, rewind, culling and callback isolation', () => {
    const surface = sdk.createSurfaceSource({cacheKey: 'validation-unicode', units: ['🌿', '⟋', 'é'], repeat: 3})
    const config = {surface, rows: 5, sectors: 7, seedCursor, advanceForRow: (row: number) => row * 3}
    const cached = new SurfaceLayoutDriver(config)
    const collect = (driver: SurfaceLayoutDriver, width: number) => {
      const records: unknown[] = []
      driver.forEachLaidOutLine({spanMin: -5, spanMax: 5, lineCoordAtRow: row => row,
        shouldVisitSlot: slot => slot.sector % 3 !== 1, getMaxWidth: () => width,
        onLine: line => { records.push(JSON.parse(JSON.stringify(line))); line.glyphs.length = 0; line.resolvedGlyphs.length = 0; line.cursorStart.segmentIndex = 999; line.cursorEnd.segmentIndex = 999 }})
      return JSON.stringify(records)
    }
    for (const width of [80, 80, 0, 18, 47.001, 47.002, 80, 200, 18]) {
      assert(collect(cached, width) === collect(new SurfaceLayoutDriver(config), width), `layout mismatch at width ${width}`)
    }
  })
  test('buffer uploads stay bounded and retain pending writes', () => {
    const attribute = new THREE.InstancedBufferAttribute(new Float32Array(1600), 16)
    updateActiveAttribute(attribute, 20); updateActiveAttribute(attribute, 5)
    assert(attribute.updateRanges.length === 1 && attribute.updateRanges[0].count === 320, 'pending upload lost or full buffer uploaded')
    for (let i = 0; i < 3000; i++) updateActiveAttribute(attribute, 4)
    assert(attribute.updateRanges.length === 1, 'unbounded pending ranges')
  })
  test('drawn WebGPU instances retire consumed upload ranges', () => {
    grass.setParams({bladeWidthScale: 1.8}); grass.update(elapsed)
    renderer.render(scene, camera)
    assert(instanced(grass)[0].instanceMatrix.updateRanges.length === 0, 'WebGPU retained the initial full upload range')
  })
  test('grass shader also compiles under WebGLRenderer', () => {
    const canvas = document.createElement('canvas')
    const gl = new THREE.WebGLRenderer({canvas})
    let shaderError = false
    gl.debug.onShaderError = () => { shaderError = true }
    const effect = sdk.createGrassEffect({seedCursor, initialParams: {...sdk.DEFAULT_GRASS_FIELD_PARAMS, layoutDensity: 0.2}})
    const localScene = new THREE.Scene()
    localScene.add(effect.group, new THREE.HemisphereLight('#ffffff', '#334422', 2))
    effect.update(2)
    gl.render(localScene, camera)
    effect.dispose(); gl.dispose()
    assert(!shaderError, 'WebGL grass shader failed to compile')
  })
  const testGrass = sdk.createGrassEffect({seedCursor, initialParams: {...sdk.DEFAULT_GRASS_FIELD_PARAMS, layoutDensity: 3}})
  const mesh = instanced(testGrass)[0]
  const cull = {cameraWorld: new THREE.Vector3(-18, 2, 18), radius: 8}
  test('idle wind and stationary culling leave instance buffers untouched', () => {
    testGrass.update(1, cull)
    const versions = [mesh.instanceMatrix.version, mesh.instanceColor!.version]
    const count = mesh.count
    testGrass.update(2, cull)
    assert(mesh.count === count && mesh.instanceMatrix.version === versions[0] && mesh.instanceColor!.version === versions[1], 'idle uploaded buffers')
  })
  test('camera movement reveals new authored cells and round-trips deterministically', () => {
    const first = Array.from(mesh.instanceMatrix.array.slice(0, mesh.count * 16))
    cull.cameraWorld.set(18, 2, -18); testGrass.update(3, cull)
    assert(mesh.count > 0, 'new camera region has no grass')
    let nearby = 0
    for (let i = 0; i < mesh.count; i++) if (mesh.instanceMatrix.array[i * 16 + 12] > 5 && mesh.instanceMatrix.array[i * 16 + 14] < -5) nearby++
    assert(nearby > 0, 'new region still contains only initial camera grass')
    cull.cameraWorld.set(-18, 2, 18); testGrass.update(4, cull)
    assert(JSON.stringify(first) === JSON.stringify(Array.from(mesh.instanceMatrix.array.slice(0, mesh.count * 16))), 'camera round-trip changed authored poses')
  })
  test('damage, recovery, dimensions and visibility changes invalidate idle state', () => {
    testGrass.update(5)
    const originalCount = mesh.count
    const version = mesh.instanceMatrix.version
    testGrass.addDisturbanceFromWorldPoint(new THREE.Vector3(0, 0, 0))
    testGrass.addBurnFromWorldPoint(new THREE.Vector3(0, 0, 0))
    testGrass.update(5.1)
    let hidden = 0
    for (let i = 0; i < mesh.count; i++) if (Math.abs(mesh.instanceMatrix.array[i * 16]) < 0.00001) hidden++
    assert(mesh.instanceMatrix.version > version && hidden > 0, 'damage did not update')
    testGrass.clearBurns(); testGrass.clearDisturbances(); testGrass.update(6)
    assert(mesh.count === originalCount, 'clear did not recover original population')
    const before = mesh.instanceMatrix.version
    testGrass.setParams({bladeHeightScale: 1.7}); testGrass.update(7)
    assert(mesh.instanceMatrix.version > before, 'scale change stayed stale')
    testGrass.setParams({layoutDensity: 0}); testGrass.update(8)
    assert(mesh.count === 0, 'zero density retained grass')
  })
  testGrass.dispose()
  test('finite high-density fields retain coverage at both ends', () => {
    const effect = sdk.createGrassEffect({seedCursor, initialParams: {...sdk.DEFAULT_GRASS_FIELD_PARAMS, layoutDensity: 200}})
    const mesh = instanced(effect)[0]
    for (const z of [-23, 23]) {
      effect.update(1, {cameraWorld: new THREE.Vector3(0, 2, z), radius: 5})
      assert(mesh.count > 100, `capacity exhausted before z=${z}`)
      for (let i = 0; i < mesh.count * 16; i++) assert(Number.isFinite(mesh.instanceMatrix.array[i]), 'invalid pose')
    }
    effect.dispose()
  })
  test('natural disturbance and burn recovery restore rest poses', () => {
    const effect = sdk.createGrassEffect({seedCursor, initialParams: {...sdk.DEFAULT_GRASS_FIELD_PARAMS, layoutDensity: 1, recoveryRate: 20, burnRecoveryRate: 20, burnSpreadSpeed: 0}})
    const mesh = instanced(effect)[0]
    effect.update(1)
    const rest = Array.from(mesh.instanceMatrix.array.slice(0, mesh.count * 16))
    effect.addDisturbanceFromWorldPoint(new THREE.Vector3(0, 0, 0))
    effect.addBurnFromWorldPoint(new THREE.Vector3(0, 0, 0))
    for (let t = 1.05; t < 3; t += 0.05) effect.update(t)
    assert(!effect.hasBurns() && !effect.hasDisturbances(), 'reactions did not decay')
    assert(JSON.stringify(rest) === JSON.stringify(Array.from(mesh.instanceMatrix.array.slice(0, mesh.count * 16))), 'recovery left stale poses')
    effect.dispose()
  })
  test('multiple canopy effects own independent burn attributes', () => {
    const first = sdk.createTreeFieldEffect({seedCursor})
    const second = sdk.createTreeFieldEffect({seedCursor})
    const a = instanced(first)[2].geometry
    const b = instanced(second)[2].geometry
    assert(a !== b && a.getAttribute('burnRim') !== b.getAttribute('burnRim'), 'tree burn state shared across instances')
    first.dispose(); second.update(1, () => 0); second.dispose()
  })
  test('sparse landscape presets actually thin populations below one glyph per slot', () => {
    const effect = sdk.createTreeFieldEffect({seedCursor, initialParams: sdk.LANDSCAPE_PRESETS.woodland.trees})
    effect.update(1, () => 0)
    const woodlandCount = instanced(effect)[0].count
    effect.setParams(sdk.LANDSCAPE_PRESETS.meadow.trees); effect.update(2, () => 0)
    assert(instanced(effect)[0].count < woodlandCount * 0.6, 'meadow still has a dense forest')
    effect.dispose()
  })
  const bench = (effect: ReturnType<typeof sdk.createGrassEffect>, active: boolean) => {
    const cull = {cameraWorld: new THREE.Vector3(0, 2, 0), radius: 20}
    effect.update(1, cull)
    if (active) effect.addDisturbanceFromWorldPoint(new THREE.Vector3(0, 0, 0), {strength: 1, recoveryRate: 0})
    for (let i = 0; i < 5; i++) effect.update(1 + i / 60, cull)
    const samples: number[] = []
    for (let i = 0; i < 40; i++) {
      const start = performance.now(); effect.update(2 + i / 60, cull); samples.push(performance.now() - start)
    }
    samples.sort((a, b) => a - b)
    return {medianMs: samples[20], p95Ms: samples[38], blades: instanced(effect)[0].count}
  }
  // Optional old bundle is generated before changes; never part of the shipped SDK.
  try {
    const baselinePath = '../validation.local/baseline.js'
    const baseline = await import(/* @vite-ignore */ baselinePath)
    const results: Record<string, unknown> = {}
    for (const active of [false, true]) {
      for (const [label, factory] of [['before', baseline.createGrassEffect], ['after', sdk.createGrassEffect]] as const) {
        const effect = factory({seedCursor, initialParams: {...sdk.DEFAULT_GRASS_FIELD_PARAMS, layoutDensity: 8, wind: 0.58}})
        results[`${label}-${active ? 'disturbed' : 'idle'}`] = bench(effect, active)
        effect.dispose()
      }
    }
    for (const [label, factory] of [['before', baseline.createTreeFieldEffect], ['after', sdk.createTreeFieldEffect]] as const) {
      const effect = factory({seedCursor})
      const geometry = instanced(effect)[2].geometry
      results[`${label}-crown-triangles`] = (geometry.index?.count ?? geometry.attributes.position.count) / 3
      effect.dispose()
    }
    lines.push('\nSame-parameter CPU update benchmark (40 samples, 5 warm-up frames):\n' + JSON.stringify(results, null, 2))
  } catch (error) { lines.push(`Baseline comparison unavailable: ${error}`) }
  output.textContent = lines.join('\n')
  output.className = lines.some(line => line.startsWith('FAIL')) ? 'fail' : 'pass'
}
$('tests').onclick = () => { void runChecks().catch(error => { output.textContent += `\nFAIL ${error}` }) }
