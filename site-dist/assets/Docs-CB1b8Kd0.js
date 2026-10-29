import{t as e}from"./jsx-runtime-xjYCO11z.js";import{t}from"./index-Dp1avf7n.js";var n=e(),r=[{title:`Landscape looks`,description:`Coordinated grass, stone, shrub, tree, and litter params in SDK units. Pair tree and shrub sources with the preset leafPile.season.`,items:[`LANDSCAPE_PRESETS.meadow`,`LANDSCAPE_PRESETS.woodland`,`LANDSCAPE_PRESETS.autumn`]},{title:`Core helpers`,description:`Create measured sources and low-level surface configs.`,items:[`createSurfaceSource()`,`createSurfaceEffect()`,`createSurfaceRuntime()`,`createInstancedMesh()`,`threeInstancedMeshRenderer()`]},{title:`Core cache lifecycle`,description:`Bound source retention, replace definitions safely, and inspect deterministic layout work.`,items:[`configureSurfaceCaches()`,`getSurfaceCacheStats()`,`releaseSurfaceSource()`,`clearSurfaceCaches()`,`clearSeedCursorCache()`,`getSeedCursorStats()`]},{title:`Terrain and culling helpers`,description:`Terrain shaping and layout-visit helpers for field-style presets.`,items:[`createTerrainReliefField()`,`DEFAULT_TERRAIN_RELIEF_PARAMS`,`TerrainReliefField`,`slotIntersectsViewFrustum()`,`shouldVisitSlotForViewCull()`]},{title:`Core world fields`,description:`Build deterministic scalar fields for placement masks, coverage, and authored world signals.`,items:[`createWorldField()`,`createFbmField()`,`createValueNoiseField()`,`domainWarpField()`,`hash01()`,`ridgeField()`,`remapField()`,`thresholdField()`]},{title:`Layouts and behaviors`,description:`Describe how a surface is traversed and how it reacts over time.`,items:[`fieldLayout()`,`wallLayout()`,`skyLayout()`,`recoverableDamage()`,`semanticStates()`]},{title:`Runtime helpers`,description:`Reusable recovery, state, and sampled motion helpers for runtime layers built on top of layout.`,items:[`createSemanticStateSet()`,`createSurfaceStateField()`,`decayRecoveringStrength()`,`updateRecoveringImpacts()`,`createSurfaceMotionField()`]},{title:`Preset factories`,description:`High-level effect entrypoints for the shipped presets.`,items:[`createBandFieldEffect()`,`createLeafPileBandEffect()`,`createFungusSeamEffect()`,`createGrassEffect()`,`createRockFieldEffect()`,`createLogFieldEffect()`,`createStickFieldEffect()`,`createNeedleLitterFieldEffect()`,`createShrubFieldEffect()`,`createTreeFieldEffect()`,`createShellSurfaceEffect()`,`createFishScaleEffect()`,`createFireWallEffect()`,`createStarSkyEffect()`,`createBookPageEffect()`]},{title:`Default params`,description:`Preset parameter defaults you can spread and override.`,items:[`DEFAULT_BAND_FIELD_PARAMS`,`DEFAULT_LEAF_PILE_BAND_PARAMS`,`DEFAULT_FUNGUS_SEAM_PARAMS`,`DEFAULT_GRASS_FIELD_PARAMS`,`DEFAULT_ROCK_FIELD_PARAMS`,`DEFAULT_LOG_FIELD_PARAMS`,`DEFAULT_STICK_FIELD_PARAMS`,`DEFAULT_NEEDLE_LITTER_FIELD_PARAMS`,`DEFAULT_SHRUB_FIELD_PARAMS`,`DEFAULT_TREE_FIELD_PARAMS`,`DEFAULT_SHELL_SURFACE_PARAMS`,`DEFAULT_FISH_SCALE_PARAMS`,`DEFAULT_FIRE_WALL_PARAMS`,`DEFAULT_STAR_SKY_PARAMS`,`DEFAULT_BOOK_PAGE_PARAMS`]},{title:`Prepared surface builders`,description:`Preset-owned source builders for ready-made surface vocabularies.`,items:[`getPreparedBandSurface()`,`getPreparedFungusBandSurface()`,`getPreparedLeafPileSurface()`,`getPreparedGrassSurface()`,`getPreparedRockSurface()`,`getPreparedLogSurface()`,`getPreparedStickSurface()`,`getPreparedNeedleLitterSurface()`,`getPreparedShrubSurface()`,`getPreparedTreeSurface()`,`getPreparedShellSurface()`,`getPreparedFishSurface()`,`getPreparedGlassSurface()`,`getPreparedIvySurface()`,`getPreparedFireSurface()`,`getPreparedStarSurface()`,`createBookPageSurface()`]},{title:`State and season builders`,description:`Helpers for swapping visual/state vocabularies without inventing a second placement system.`,items:[`buildGrassStateSurface()`,`buildLeafPileSeasonSurface()`,`LEAF_PILE_SEASONS`,`buildShrubSeasonSurface()`,`SHRUB_FOLIAGE_SEASONS`,`buildTreeSeasonSurface()`,`TREE_FOLIAGE_SEASONS`]}],i=[{title:`Shared three-entrypoint types`,description:"Top-level config, terrain, and culling types from `weft-sdk/three`.",items:[`RecoverableDamageConfig`,`SurfaceEffectConfig`,`ThreeInstancedMeshRendererConfig`,`TerrainHeightSampler`,`TerrainReliefParams`,`PresetLayoutViewCull`,`PresetLayoutViewCullFrustumContext`]},{title:`Band and seam preset types`,description:`Band-family option, param, season, and placement types.`,items:[`BandFieldAppearance`,`BandFieldBounds`,`BandFieldPlacementMask`,`BandFieldParams`,`CreateBandFieldEffectOptions`,`CreateLeafPileBandEffectOptions`,`LeafPileDisturbanceOptions`,`LeafPileBandBounds`,`LeafPileBandPlacementMask`,`LeafPileBandParams`,`LeafPileSeason`,`LeafPileTokenId`,`LeafPileTokenMeta`,`CreateFungusSeamEffectOptions`,`FungusBurnOptions`,`FungusSeamBounds`,`FungusSeamPlacementMask`,`FungusSeamParams`]},{title:`Field and bark preset types`,description:`Ground-cover, clutter, tree, and bark option/param exports.`,items:`CreateGrassEffectOptions.GrassFieldBounds.GrassFieldPlacementMask.GrassDisturbanceOptions.GrassBurnOptions.GrassFieldParams.CreateRockFieldEffectOptions.RockFieldBounds.RockFieldDestructOptions.RockFieldPlacementMask.RockFieldParams.CreateShrubFieldEffectOptions.ShrubFieldBounds.ShrubFieldPlacementMask.ShrubFieldParams.ShrubFoliageBurnOptions.CreateTreeFieldEffectOptions.TreeCrownBurnOptions.TreeFieldBounds.TreeFieldPlacementMask.TreeFieldParams.CreateLogFieldEffectOptions.LogFieldBounds.LogFieldPlacementMask.LogFieldParams.CreateStickFieldEffectOptions.StickFieldBounds.StickFieldPlacementMask.StickFieldParams.CreateNeedleLitterFieldEffectOptions.NeedleLitterFieldBounds.NeedleLitterFieldPlacementMask.NeedleLitterFieldParams.NeedleLitterBurnOptions`.split(`.`)},{title:`Wall, sky, and page preset types`,description:`Shell-family, sky, fire, and page export types.`,items:[`CreateShellSurfaceEffectOptions`,`CreateFishScaleEffectOptions`,`ShellSurfaceAppearance`,`ShellSurfaceParams`,`FishScaleAppearance`,`FishScaleParams`,`CreateFireWallEffectOptions`,`FireWallParams`,`CreateStarSkyEffectOptions`,`StarSkyParams`,`CreateBookPageEffectOptions`,`BookPageParams`,`BookGlyphMeta`]},{title:`Core entrypoint types`,description:"Source, layout, and world-field types from `weft-sdk/core`.",items:[`PreparedSurfaceSource`,`ResolvedSurfaceGlyph`,`SeedCursorFactory`,`SurfaceGlyphUnits`,`SurfacePaletteEntry`,`SurfaceShorthandMeta`,`SurfaceLayoutLine`,`SurfaceLayoutSlot`,`CreateWorldFieldOptions`,`DomainWarpFieldOptions`,`FbmFieldOptions`,`RemapFieldOptions`,`ThresholdFieldOptions`,`ValueNoiseFieldOptions`,`WorldField2`]},{title:`Runtime entrypoint types`,description:"State, recovery, and motion field types from `weft-sdk/runtime`.",items:[`SemanticStateSet`,`SurfaceBehavior`,`SurfacePreset`,`SurfaceRendererAdapter`,`SurfaceStateField`,`SurfaceMotionField`,`SurfaceMotionFieldBounds`,`SurfaceMotionFieldOptions`,`SurfaceMotionFieldSample`,`SurfaceMotionImpulseOptions`,`RecoveringImpact`]}],a=[{name:`Band field`,factory:`createBandFieldEffect()`,builders:[`getPreparedBandSurface()`],useCase:`A terrain-projected strip preset for roadsides, seams, rows, roots, foam bands, and other narrow environmental corridors.`,params:[`layoutDensity`,`sizeScale`,`bandWidth`,`edgeSoftness`]},{name:`Leaf pile band`,factory:`createLeafPileBandEffect()`,builders:[`buildLeafPileSeasonSurface()`,`getPreparedLeafPileSurface()`],useCase:`A flatter band-style preset for verge piles, gutter clutter, hedgerow drift, and other leaf accumulations with season-driven visual states.`,params:[`layoutDensity`,`sizeScale`,`bandWidth`,`edgeSoftness`,`season`,`burnRadius`,`burnSpreadSpeed`,`burnMaxRadius`]},{name:`Fungus seam`,factory:`createFungusSeamEffect()`,builders:[`getPreparedFungusBandSurface()`],useCase:`A narrow reactive seam preset for roots, glowing cracks, fungal growth, and other edge-following clutter that can burn and recover.`,params:[`layoutDensity`,`sizeScale`,`bandWidth`,`edgeSoftness`,`burnRadius`,`burnSpreadSpeed`,`burnMaxRadius`,`recoveryRate`]},{name:`Grass field`,factory:`createGrassEffect()`,builders:[`buildGrassStateSurface()`,`getPreparedGrassSurface()`],useCase:`Reactive ground cover that can be disturbed, healed, and swapped between healthy, dry, corrupted, and dead states.`,params:[`disturbanceRadius`,`disturbanceStrength`,`trampleDepth`,`wind`,`recoveryRate`,`state`,`colorSeason`,`layoutDensity`]},{name:`Rock field`,factory:`createRockFieldEffect()`,builders:[`getPreparedRockSurface()`],useCase:`Deterministic rock placement projected onto terrain without separate scatter tooling.`,params:[`layoutDensity`,`sizeScale`]},{name:`Log field`,factory:`createLogFieldEffect()`,builders:[`getPreparedLogSurface()`],useCase:`Persistent laid-out logs that can be shoved and rolled using per-slot motion state instead of separate rigid bodies.`,params:[`layoutDensity`,`sizeScale`,`lengthScale`]},{name:`Stick field`,factory:`createStickFieldEffect()`,builders:[`getPreparedStickSurface()`],useCase:`Spawn-in-clumps, react-as-individual-twigs debris for understory clutter, footsteps, and shots.`,params:[`layoutDensity`,`sizeScale`,`lengthScale`]},{name:`Needle litter`,factory:`createNeedleLitterFieldEffect()`,builders:[`getPreparedNeedleLitterSurface()`],useCase:`Cheap conifer-style ground litter that works well under trees and other forest-biased world-field masks.`,params:[`layoutDensity`,`sizeScale`]},{name:`Shrub field`,factory:`createShrubFieldEffect()`,builders:[`buildShrubSeasonSurface()`,`getPreparedShrubSurface()`],useCase:`Static clustered understory that fills the mid-layer between ground litter and taller trees, with season-aware foliage appearance.`,params:[`layoutDensity`,`sizeScale`,`heightScale`,`burnRadius`,`burnSpreadSpeed`,`burnMaxRadius`,`recoveryRate`]},{name:`Tree field`,factory:`createTreeFieldEffect()`,builders:[`buildTreeSeasonSurface()`,`getPreparedTreeSurface()`],useCase:`Sparse deterministic trunks and canopies for forest silhouettes without adding a new core placement primitive.`,params:[`layoutDensity`,`sizeScale`,`heightScale`,`crownScale`,`crownBurnRadius`,`crownBurnSpreadSpeed`,`crownBurnMaxRadius`,`crownBurnRecoveryRate`]},{name:`Shell surface`,factory:`createShellSurfaceEffect()`,builders:[`getPreparedShellSurface()`,`getPreparedGlassSurface()`,`getPreparedIvySurface()`],useCase:`A layered shell-surface family for shutters, ivy, fish-like walling, and glass variants with persistent wounds and deformation.`,params:[`woundRadius`,`woundNarrow`,`woundDepth`,`scaleLift`,`surfaceFlex`,`recoveryRate`]},{name:`Fish scale surface`,factory:`createFishScaleEffect()`,builders:[`getPreparedFishSurface()`],useCase:`A dedicated fish-scale flavored shell preset when you want the fish read directly instead of a generic shell appearance.`,params:[`woundRadius`,`woundNarrow`,`woundDepth`,`scaleLift`,`surfaceFlex`,`recoveryRate`]},{name:`Fire wall`,factory:`createFireWallEffect()`,builders:[`getPreparedFireSurface()`],useCase:`A puncturable wall of particles that opens under damage and recovers over time.`,params:[`recoveryRate`,`holeSize`]},{name:`Star sky`,factory:`createStarSkyEffect()`,builders:[`getPreparedStarSurface()`],useCase:`A sky dome layout that supports density tuning and recoverable wounds in the sky.`,params:[`layoutDensity`,`recoveryRate`]},{name:`Book page`,factory:`createBookPageEffect()`,builders:[`createBookPageSurface()`],useCase:`A stylized page/text preset for readable or decorative book-like surfaces that still follow Weft layout rules.`,params:[`activationDepth`,`influenceRadius`,`pushStrength`,`coreClearRadius`]}],o=[{title:`Band field setup`,code:`import {
  DEFAULT_BAND_FIELD_PARAMS,
  createBandFieldEffect,
  getPreparedBandSurface,
} from 'weft-sdk/three'
import { seedCursor } from 'weft-sdk/core'

const roadsideBand = createBandFieldEffect({
  seedCursor,
  surface: getPreparedBandSurface(),
  initialParams: {
    ...DEFAULT_BAND_FIELD_PARAMS,
    bandWidth: 3.2,
    edgeSoftness: 1.1,
  },
  placementMask: {
    bounds: { minX: -20, maxX: 20, minZ: -12, maxZ: 12 },
    distanceToBandAtXZ: (x, z) => z - Math.sin(x * 0.18) * 1.4,
  },
})

scene.add(roadsideBand.group)`},{title:`Leaf pile band setup`,code:`import {
  DEFAULT_LEAF_PILE_BAND_PARAMS,
  createLeafPileBandEffect,
} from 'weft-sdk/three'
import { seedCursor } from 'weft-sdk/core'

const leafPile = createLeafPileBandEffect({
  seedCursor,
  initialParams: {
    ...DEFAULT_LEAF_PILE_BAND_PARAMS,
    season: 'autumn',
    bandWidth: 2.8,
  },
  placementMask: {
    bounds: { minX: -20, maxX: 20, minZ: -12, maxZ: 12 },
    distanceToBandAtXZ: (x, z) => z - Math.sin(x * 0.18) * 1.2,
  },
})

scene.add(leafPile.group)`},{title:`Grass quick start`,code:`import {
  DEFAULT_GRASS_FIELD_PARAMS,
  createGrassEffect,
  createSurfaceSource,
} from 'weft-sdk/three'
import { seedCursor } from 'weft-sdk/core'

const surface = createSurfaceSource({
  cacheKey: 'field-shell',
  units: ['⟋', '⟍', '❘', '❙'],
  repeat: 28,
})

const grass = createGrassEffect({
  seedCursor,
  surface,
  initialParams: {
    ...DEFAULT_GRASS_FIELD_PARAMS,
    layoutDensity: 8,
  },
})

scene.add(grass.group)`},{title:`World field mask setup`,code:`import {
  DEFAULT_TREE_FIELD_PARAMS,
  createTreeFieldEffect,
  getPreparedTreeSurface,
} from 'weft-sdk/three'
import { createWorldField, seedCursor } from 'weft-sdk/core'

const placementSignal = createWorldField(17, {
  scale: 30,
  roughness: 0.58,
  warpAmplitude: 10,
})

const effect = createTreeFieldEffect({
  seedCursor,
  surface: getPreparedTreeSurface(),
  initialParams: {
    ...DEFAULT_TREE_FIELD_PARAMS,
    layoutDensity: 0.85,
  },
  placementMask: {
    bounds: { minX: -48, maxX: 48, minZ: -48, maxZ: 48 },
    includeAtXZ: (x, z) => placementSignal(x, z) > 0.6,
  },
})

scene.add(effect.group)`},{title:`Persistent motion field`,code:`import { createSurfaceMotionField } from 'weft-sdk/runtime'

const motionField = createSurfaceMotionField(
  { minX: -32, maxX: 32, minZ: -32, maxZ: 32 },
  { cellSize: 1.25, drag: 1.9, maxOffset: 12 },
)

function update(dt: number) {
  motionField.update(dt)
}

function shoveLogs(x: number, z: number, dirX: number, dirZ: number) {
  motionField.writeImpulse(x, z, {
    radius: 1.8,
    strength: 1.2,
    directionX: dirX,
    directionZ: dirZ,
    tangentialStrength: 0.3,
    spin: 0.45,
  })
}

const motion = motionField.sample(worldX, worldZ)
dummy.position.x += motion.offsetX
dummy.position.z += motion.offsetZ`},{title:`Where Weft goes in your app`,code:`const scene = new THREE.Scene()

const grass = createGrassEffect({
  seedCursor,
  surface,
  initialParams: DEFAULT_GRASS_FIELD_PARAMS,
})

scene.add(grass.group)

function update(dt: number) {
  // Your game/runtime code stays here.
  // Drive Weft params, damage, or semantic state from gameplay.
}

function render() {
  renderer.render(scene, camera)
}`},{title:`Semantic palette source`,code:`import { createSurfaceSource } from 'weft-sdk/three'

const coralSurface = createSurfaceSource({
  cacheKey: 'coral',
  semantic: true,
  repeat: 20,
  palette: [
    { id: 'branch', glyph: 'Y', weight: 4, meta: { scale: 1.2 } },
    { id: 'fan', glyph: '*', weight: 2, meta: { scale: 0.8 } },
    { id: 'bud', glyph: '.', weight: 6, meta: { scale: 0.4 } },
  ],
})`},{title:`Wall effect setup`,code:`import {
  DEFAULT_FIRE_WALL_PARAMS,
  createFireWallEffect,
  getPreparedFireSurface,
} from 'weft-sdk/three'
import { seedCursor } from 'weft-sdk/core'

const fireWall = createFireWallEffect({
  seedCursor,
  surface: getPreparedFireSurface(),
  initialParams: {
    ...DEFAULT_FIRE_WALL_PARAMS,
    holeSize: 1.25,
  },
})

scene.add(fireWall.group)`},{title:`Customize a shipped preset`,code:`import {
  DEFAULT_SHELL_SURFACE_PARAMS,
  createShellSurfaceEffect,
  createSurfaceSource,
} from 'weft-sdk/three'
import { seedCursor } from 'weft-sdk/core'

const ivySurface = createSurfaceSource({
  cacheKey: 'ivy-shell',
  semantic: true,
  repeat: 22,
  palette: [
    { id: 'leaf', glyph: '◓', weight: 5, meta: { hueBias: 0.03 } },
    { id: 'bud', glyph: '•', weight: 2, meta: { hueBias: 0.08 } },
  ],
})

const ivyWall = createShellSurfaceEffect({
  seedCursor,
  surface: ivySurface,
  appearance: 'ivy',
  initialParams: {
    ...DEFAULT_SHELL_SURFACE_PARAMS,
    woundNarrow: 0.12,
    recoveryRate: 0.2,
    surfaceFlex: 0.18,
  },
})

scene.add(ivyWall.group)`},{title:`Define a custom effect config`,code:`import * as THREE from 'three'
import {
  createSurfaceEffect,
  createSurfaceSource,
  fieldLayout,
  recoverableDamage,
  threeInstancedMeshRenderer,
} from 'weft-sdk/three'
import { seedCursor } from 'weft-sdk/core'

const emberSurface = createSurfaceSource({
  cacheKey: 'ember-band',
  units: ['.', '*', '•'],
  repeat: 20,
})

const emberEffect = createSurfaceEffect({
  id: 'ember-band',
  source: emberSurface,
  seedCursor,
  layout: fieldLayout({
    rows: 20,
    sectors: 32,
    advanceForRow: (row) => row * 11 + 3,
    staggerFactor: 0.4,
    minSpanFactor: 0.3,
  }),
  renderer: threeInstancedMeshRenderer({
    geometry: new THREE.PlaneGeometry(0.16, 0.16),
    material: new THREE.MeshBasicMaterial({ color: '#ff8a44' }),
    maxInstances: 2400,
  }),
  behaviors: [
    recoverableDamage({
      radius: 1.2,
      recoveryRate: 0.35,
    }),
  ],
})

const runtime = emberEffect.createRuntime({
  spanMin: -16,
  spanMax: 16,
  lineCoordAtRow: row => row - 10,
  getMaxWidth: slot => slot.spanSize * 32,
  projectGlyph({ slot, glyphIndex, glyphCount }, { transform }) {
    transform.position.set(
      slot.spanStart + (glyphIndex + 0.5) / glyphCount * slot.spanSize,
      0.2,
      slot.lineCoord,
    )
  },
  disposeResources: true,
})
scene.add(runtime.group)
// Call before rendering each frame. Idle transforms stay cached.
runtime.update(elapsedSeconds)
runtime.addImpact(0, 0)
// After changing one row's authored inputs:
runtime.invalidateRows(8, 9)
// On teardown: runtime.dispose()`}];function s({onEnterEditor:e}){return(0,n.jsx)(`div`,{className:`docs`,children:(0,n.jsxs)(`div`,{className:`docs__inner`,children:[(0,n.jsx)(`p`,{className:`docs__eyebrow`,children:`SDK docs`}),(0,n.jsx)(`h1`,{className:`docs__title`,children:`Weft SDK guide and API reference`}),(0,n.jsxs)(`p`,{className:`docs__lead`,children:[`This page documents the current SDK surface that ships in the package today. It is guide-first, but every section maps back to the real exports from `,(0,n.jsx)(`code`,{className:`docs__code-inline`,children:`weft-sdk/three`}),`. The main value is not just that you can place dense surfaces. It is that the same authored surface can handle placement, damage, thinning, recovery, and state change under one deterministic model.`]}),(0,n.jsx)(`p`,{className:`docs__eyebrow`,children:`Current release: 1.0.0 as of March 31, 2026`}),(0,n.jsxs)(`div`,{className:`docs__callout docs__callout--agent`,children:[(0,n.jsx)(`strong`,{className:`docs__callout-title`,children:`AI agent guide`}),(0,n.jsxs)(`p`,{className:`docs__callout-text`,children:[`Need a high-signal file for Claude, Cursor, or other coding agents? Read`,` `,(0,n.jsx)(`a`,{href:t,target:`_blank`,rel:`noreferrer`,children:(0,n.jsx)(`code`,{className:`docs__code-inline`,children:`weft.md`})}),`. It is written as copy-pasteable integration context. You can paste it directly into a Cursor rule, Claude project knowledge/instructions, or another agent setup file so codegen tools have the right mental model, real exports, and integration guidance for Weft.`]}),(0,n.jsx)(`p`,{className:`docs__callout-text`,children:`If you are using an AI coding assistant, this is the file to hand it before asking for examples, integration help, architecture suggestions, or new surface ideas.`})]}),(0,n.jsxs)(`div`,{className:`docs__actions`,children:[(0,n.jsx)(`button`,{type:`button`,className:`btn btn--primary`,onClick:e,children:`Open third person demo`}),(0,n.jsx)(`a`,{className:`btn btn--secondary`,href:`#quick-start`,children:`Jump to quick start`})]}),(0,n.jsxs)(`nav`,{className:`docs__toc`,"aria-label":`Docs sections`,children:[(0,n.jsx)(`a`,{className:`docs__toc-link`,href:`#quick-start`,children:`Quick start`}),(0,n.jsx)(`a`,{className:`docs__toc-link`,href:`#where-it-fits`,children:`Where it fits`}),(0,n.jsx)(`a`,{className:`docs__toc-link`,href:`#concepts`,children:`Concepts`}),(0,n.jsx)(`a`,{className:`docs__toc-link`,href:`#customization`,children:`Customization`}),(0,n.jsx)(`a`,{className:`docs__toc-link`,href:`#presets`,children:`Preset guides`}),(0,n.jsx)(`a`,{className:`docs__toc-link`,href:`#api-reference`,children:`API reference`}),(0,n.jsx)(`a`,{className:`docs__toc-link`,href:`#examples`,children:`Examples`})]}),(0,n.jsxs)(`section`,{id:`quick-start`,className:`docs__section`,children:[(0,n.jsx)(`h2`,{className:`docs__section-title`,children:`Quick start`}),(0,n.jsxs)(`p`,{className:`docs__text`,children:[`Install `,(0,n.jsx)(`code`,{className:`docs__code-inline`,children:`weft-sdk`}),` with `,(0,n.jsx)(`code`,{className:`docs__code-inline`,children:`three`}),`, then start by creating a measured source and feeding it into a preset factory. The preset gives you a Three.js group that you mount into your own scene like any other scene object.`]}),(0,n.jsxs)(`div`,{className:`docs__code-block`,children:[(0,n.jsx)(`p`,{className:`docs__code-label`,children:`Install`}),(0,n.jsx)(`pre`,{className:`docs__pre`,children:`npm install weft-sdk three`})]}),(0,n.jsxs)(`div`,{className:`docs__code-block`,children:[(0,n.jsx)(`p`,{className:`docs__code-label`,children:`First effect`}),(0,n.jsx)(`pre`,{className:`docs__pre`,children:`import {
  DEFAULT_GRASS_FIELD_PARAMS,
  createGrassEffect,
  createSurfaceSource,
} from 'weft-sdk/three'
import { seedCursor } from 'weft-sdk/core'

const surface = createSurfaceSource({
  cacheKey: 'my-surface',
  units: ['◓', '◒', '◐', '◑'],
  repeat: 22,
})

const grass = createGrassEffect({
  seedCursor,
  surface,
  initialParams: DEFAULT_GRASS_FIELD_PARAMS,
})

scene.add(grass.group)`})]})]}),(0,n.jsxs)(`section`,{id:`where-it-fits`,className:`docs__section`,children:[(0,n.jsx)(`h2`,{className:`docs__section-title`,children:`Where Weft fits in your app`}),(0,n.jsx)(`p`,{className:`docs__text`,children:`A common beginner question is "where does this actually go?" The short answer is: Weft plugs into your existing scene and runtime. It does not replace your camera, renderer, world update loop, ECS, player controller, or gameplay architecture.`}),(0,n.jsxs)(`div`,{className:`docs__concept-grid`,children:[(0,n.jsxs)(`article`,{className:`docs__concept-card`,children:[(0,n.jsx)(`h3`,{className:`docs__card-title`,children:`1. Create the effect`}),(0,n.jsxs)(`p`,{className:`docs__card-text`,children:[`Build a source with `,(0,n.jsx)(`code`,{className:`docs__code-inline`,children:`createSurfaceSource()`}),`, then create a preset effect such as `,(0,n.jsx)(`code`,{className:`docs__code-inline`,children:`createGrassEffect()`}),`.`]})]}),(0,n.jsxs)(`article`,{className:`docs__concept-card`,children:[(0,n.jsx)(`h3`,{className:`docs__card-title`,children:`2. Mount it into your scene`}),(0,n.jsx)(`p`,{className:`docs__card-text`,children:`Each preset exposes a group. Add that group to your Three.js scene the same way you would add any mesh, light, or instanced object.`})]}),(0,n.jsxs)(`article`,{className:`docs__concept-card`,children:[(0,n.jsx)(`h3`,{className:`docs__card-title`,children:`3. Drive it from gameplay`}),(0,n.jsx)(`p`,{className:`docs__card-text`,children:`Your app still owns player input, collisions, world state, and timing. Weft is the surface layer that responds to those signals through params, damage, recovery, and semantic state.`})]})]}),(0,n.jsxs)(`div`,{className:`docs__callout`,children:[(0,n.jsx)(`strong`,{className:`docs__callout-title`,children:`What Weft handles vs. what you handle`}),(0,n.jsx)(`p`,{className:`docs__callout-text`,children:`Weft handles source preparation, deterministic layout, thinning, recovery helpers, and world-space projection for reactive surfaces.`}),(0,n.jsx)(`p`,{className:`docs__callout-text`,children:`Your app handles scene setup, camera control, render loop ownership, collision/gameplay rules, save state, networking, and any broader engine architecture around those surfaces.`})]})]}),(0,n.jsxs)(`section`,{id:`concepts`,className:`docs__section`,children:[(0,n.jsx)(`h2`,{className:`docs__section-title`,children:`Concepts`}),(0,n.jsxs)(`div`,{className:`docs__concept-grid`,children:[(0,n.jsxs)(`article`,{className:`docs__concept-card`,children:[(0,n.jsx)(`h3`,{className:`docs__card-title`,children:`1. Source`}),(0,n.jsxs)(`p`,{className:`docs__card-text`,children:[`A source is a measured glyph stream. Use `,(0,n.jsx)(`code`,{className:`docs__code-inline`,children:`createSurfaceSource()`}),` `,`with either simple units or an explicit semantic palette when you need stable ids and metadata.`]})]}),(0,n.jsxs)(`article`,{className:`docs__concept-card`,children:[(0,n.jsx)(`h3`,{className:`docs__card-title`,children:`2. Layout`}),(0,n.jsxs)(`p`,{className:`docs__card-text`,children:[`A layout describes rows, sectors, and width. Use `,(0,n.jsx)(`code`,{className:`docs__code-inline`,children:`fieldLayout()`}),`,`,` `,(0,n.jsx)(`code`,{className:`docs__code-inline`,children:`wallLayout()`}),`, or `,(0,n.jsx)(`code`,{className:`docs__code-inline`,children:`skyLayout()`}),` `,`depending on the surface topology you want.`]})]}),(0,n.jsxs)(`article`,{className:`docs__concept-card`,children:[(0,n.jsx)(`h3`,{className:`docs__card-title`,children:`3. Effect`}),(0,n.jsxs)(`p`,{className:`docs__card-text`,children:[`An effect projects laid-out glyphs into world-space instances. Preset factories such as`,` `,(0,n.jsx)(`code`,{className:`docs__code-inline`,children:`createGrassEffect()`}),` and`,` `,(0,n.jsx)(`code`,{className:`docs__code-inline`,children:`createFireWallEffect()`}),` package that projection for you.`]})]})]}),(0,n.jsxs)(`div`,{className:`docs__callout`,children:[(0,n.jsx)(`strong`,{className:`docs__callout-title`,children:`Mental model`}),(0,n.jsx)(`p`,{className:`docs__callout-text`,children:`Weft turns surface density into a layout problem. Narrow width and fewer glyphs fit. Change semantic weights and the same surface shifts state without a separate scatter pipeline.`}),(0,n.jsxs)(`p`,{className:`docs__callout-text`,children:[`The main primitives behind that model are `,(0,n.jsx)(`code`,{className:`docs__code-inline`,children:`createSurfaceSource()`}),`,`,` `,(0,n.jsx)(`code`,{className:`docs__code-inline`,children:`recoverableDamage()`}),`, and the layout helpers in`,` `,(0,n.jsx)(`code`,{className:`docs__code-inline`,children:`weft-sdk/three`}),`.`]}),(0,n.jsx)(`p`,{className:`docs__callout-text`,children:`If you are evaluating fit, a good rule of thumb is this: Weft is strongest when world scatter can be treated as a deterministic reactive surface: ground cover, facade layers, rubble bands, crops, shell-like clutter, and other distributions that benefit from shared placement, thinning, recovery, and state change.`})]})]}),(0,n.jsxs)(`section`,{id:`customization`,className:`docs__section`,children:[(0,n.jsx)(`h2`,{className:`docs__section-title`,children:`Customization paths`}),(0,n.jsx)(`p`,{className:`docs__text`,children:`Presets are the fastest way in, but they are not the end of the SDK. There are two common ways to go further.`}),(0,n.jsxs)(`div`,{className:`docs__concept-grid`,children:[(0,n.jsxs)(`article`,{className:`docs__concept-card`,children:[(0,n.jsx)(`h3`,{className:`docs__card-title`,children:`1. Push a preset further`}),(0,n.jsx)(`p`,{className:`docs__card-text`,children:`Keep the preset projection and behavior model, but swap in your own source, semantic palette, placement mask, subtype appearance, and param overrides. This is the right path when your surface is still "band-like", "grass-like", "shell-like", "rock-like", or "fire-like" but needs a different authored look or response.`})]}),(0,n.jsxs)(`article`,{className:`docs__concept-card`,children:[(0,n.jsx)(`h3`,{className:`docs__card-title`,children:`2. Build your own effect`}),(0,n.jsxs)(`p`,{className:`docs__card-text`,children:[`Use `,(0,n.jsx)(`code`,{className:`docs__code-inline`,children:`createSurfaceSource()`}),`, a layout helper, and`,` `,(0,n.jsx)(`code`,{className:`docs__code-inline`,children:`createSurfaceEffect()`}),` when you want a new projection, material setup, or shader system on top of the same source -> layout -> effect model.`]})]})]}),(0,n.jsxs)(`div`,{className:`docs__callout`,children:[(0,n.jsx)(`strong`,{className:`docs__callout-title`,children:`Simple rule of thumb`}),(0,n.jsx)(`p`,{className:`docs__callout-text`,children:`If the shipped preset already matches the surface topology, customize the preset first. If the topology or projection is new, keep Weft for source/layout/behavior and write a new renderer or runtime wrapper around those helpers.`}),(0,n.jsxs)(`p`,{className:`docs__callout-text`,children:[`If you need persistent object-less motion, keep authored layout as the baseline and layer sampled runtime state on top with `,(0,n.jsx)(`code`,{className:`docs__code-inline`,children:`createSurfaceMotionField()`}),` `,`from `,(0,n.jsx)(`code`,{className:`docs__code-inline`,children:`weft-sdk/runtime`}),`.`]})]})]}),(0,n.jsxs)(`section`,{id:`presets`,className:`docs__section`,children:[(0,n.jsx)(`h2`,{className:`docs__section-title`,children:`Preset guides`}),(0,n.jsx)(`div`,{className:`docs__preset-grid`,children:a.map(e=>(0,n.jsxs)(`article`,{className:`docs__preset-card`,children:[(0,n.jsx)(`h3`,{className:`docs__card-title`,children:e.name}),(0,n.jsx)(`p`,{className:`docs__card-text`,children:e.useCase}),(0,n.jsxs)(`p`,{className:`docs__meta`,children:[(0,n.jsx)(`strong`,{children:`Factory:`}),` `,(0,n.jsx)(`code`,{className:`docs__code-inline`,children:e.factory})]}),(0,n.jsxs)(`p`,{className:`docs__meta`,children:[(0,n.jsx)(`strong`,{children:`Default source:`}),` `,e.builders.map((e,t)=>(0,n.jsxs)(`span`,{children:[t>0?` / `:``,(0,n.jsx)(`code`,{className:`docs__code-inline`,children:e})]},e))]}),(0,n.jsxs)(`p`,{className:`docs__meta`,children:[(0,n.jsx)(`strong`,{children:`Main params:`}),` `,e.params.map((e,t)=>(0,n.jsxs)(`span`,{children:[t>0?`, `:``,(0,n.jsx)(`code`,{className:`docs__code-inline`,children:e})]},e))]})]},e.name))})]}),(0,n.jsxs)(`section`,{id:`api-reference`,className:`docs__section`,children:[(0,n.jsx)(`h2`,{className:`docs__section-title`,children:`API reference`}),(0,n.jsxs)(`p`,{className:`docs__text`,children:[`These groups mirror the public value exports currently shipped from`,` `,(0,n.jsx)(`code`,{className:`docs__code-inline`,children:`weft-sdk/three`}),`,`,` `,(0,n.jsx)(`code`,{className:`docs__code-inline`,children:`weft-sdk/core`}),`, and`,` `,(0,n.jsx)(`code`,{className:`docs__code-inline`,children:`weft-sdk/runtime`}),`.`]}),(0,n.jsx)(`div`,{className:`docs__api-grid`,children:r.map(e=>(0,n.jsxs)(`article`,{className:`docs__api-card`,children:[(0,n.jsx)(`h3`,{className:`docs__card-title`,children:e.title}),(0,n.jsx)(`p`,{className:`docs__card-text`,children:e.description}),(0,n.jsx)(`ul`,{className:`docs__api-list`,children:e.items.map(e=>(0,n.jsx)(`li`,{children:(0,n.jsx)(`code`,{className:`docs__code-inline`,children:e})},e))})]},e.title))}),(0,n.jsx)(`p`,{className:`docs__text`,children:`The package also exports a large typed surface for preset options, params, placement masks, burn/wound options, and runtime helpers. Those type exports are grouped below so the docs stay aligned with the real entrypoints instead of hand-waving over "and some types".`}),(0,n.jsx)(`div`,{className:`docs__api-grid`,children:i.map(e=>(0,n.jsxs)(`article`,{className:`docs__api-card`,children:[(0,n.jsx)(`h3`,{className:`docs__card-title`,children:e.title}),(0,n.jsx)(`p`,{className:`docs__card-text`,children:e.description}),(0,n.jsx)(`ul`,{className:`docs__api-list`,children:e.items.map(e=>(0,n.jsx)(`li`,{children:(0,n.jsx)(`code`,{className:`docs__code-inline`,children:e})},e))})]},e.title))})]}),(0,n.jsxs)(`section`,{id:`examples`,className:`docs__section`,children:[(0,n.jsx)(`h2`,{className:`docs__section-title`,children:`Copy-paste examples`}),(0,n.jsx)(`div`,{className:`docs__examples`,children:o.map(e=>(0,n.jsxs)(`div`,{className:`docs__code-block`,children:[(0,n.jsx)(`p`,{className:`docs__code-label`,children:e.title}),(0,n.jsx)(`pre`,{className:`docs__pre`,children:e.code})]},e.title))}),(0,n.jsxs)(`div`,{className:`docs__actions docs__actions--final-cta`,children:[(0,n.jsx)(`p`,{className:`docs__text docs__text--final-cta`,children:`Thanks for reading along. Open the third person demo to see the same ideas running under one surface runtime.`}),(0,n.jsx)(`button`,{type:`button`,className:`btn btn--primary docs__final-cta-btn`,onClick:e,children:`Open third person demo and explore the SDK`})]})]})]})})}export{s as Docs};