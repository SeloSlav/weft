# Weft

Deterministic reactive surface SDK for Three.js.

Weft lets you author surfaces as `source -> layout -> effect` so placement and gameplay response stay in one model instead of splitting into scatter code plus a separate reaction system.

- Live site: [pretext-weft.vercel.app](https://pretext-weft.vercel.app)
- npm package: [`weft-sdk`](https://www.npmjs.com/package/weft-sdk)
- AI integration guide: [`weft.md`](./weft.md)

Current release: `1.0.0` as of March 31, 2026.

![Playground screenshot](https://raw.githubusercontent.com/SeloSlav/weft/main/public/readme-playground-screenshot.png)

## Mental model

Think about Weft as:

`source -> layout -> effect`

- `source`: a measured stream built from repeated units or a semantic palette
- `layout`: rows, sectors, and available width across a surface
- `effect`: projection of laid-out glyphs into world-space instances

The key contract is width:

- narrower width means fewer glyphs fit
- zero width means that part of the surface disappears
- semantic state can change the apparent surface without inventing a second placement pipeline

## Where it fits

Weft is strongest when the thing you are placing can honestly be treated as a reactive surface:

- grass and ground cover
- roadside bands, seams, clutter corridors, and fungus strips
- leaf litter, sticks, needles, logs, rocks, shrubs, and trees
- shell-like walls, shutters, ivy, glass, and fish-scale surfaces
- puncturable fire walls and recoverable sky surfaces
- stylized page/text surfaces and other layout-driven instance fields

It is not trying to replace every biome or world-simulation system. It works best when deterministic layout, thinning, recovery, and semantic state are the main problem.

## Package layers

- `weft-sdk/three`: preset factories, layouts, behaviors, and Three.js-facing helpers
- `weft-sdk/core`: source preparation, deterministic seed cursors, layout traversal, and world-field helpers
- `weft-sdk/runtime`: reusable state, recovery, and sampled motion helpers

## Shipped presets

`LANDSCAPE_PRESETS` provides three coordinated looks: `meadow` (Open meadow),
`woodland` (Fern glade), and `autumn` (Amber woodland). Each contains complete
`grass`, `rocks`, `shrubs`, `trees`, and `leafPile` parameter objects in SDK units.
The first-person demo includes a landscape selector and a reset button.

```ts
import { createGrassEffect, LANDSCAPE_PRESETS } from 'weft-sdk/three'
import { seedCursor } from 'weft-sdk/core'

const grass = createGrassEffect({
  seedCursor,
  initialParams: { ...LANDSCAPE_PRESETS.meadow.grass },
})
scene.add(grass.group)
// Supply scene lighting, then update before rendering each frame.
grass.update(elapsedSeconds)
```

Current public presets include:

- `createBandFieldEffect()`
- `createLeafPileBandEffect()`
- `createFungusSeamEffect()`
- `createGrassEffect()`
- `createRockFieldEffect()`
- `createLogFieldEffect()`
- `createStickFieldEffect()`
- `createNeedleLitterFieldEffect()`
- `createShrubFieldEffect()`
- `createTreeFieldEffect()`
- `createShellSurfaceEffect()`
- `createFishScaleEffect()`
- `createFireWallEffect()`
- `createStarSkyEffect()`
- `createBookPageEffect()`

## Quick start

Install the package with Three.js:

```bash
npm install weft-sdk three
```

Then create a source, feed it into a preset, and mount the returned group into your scene:

```ts
import * as THREE from 'three'
import {
  DEFAULT_GRASS_FIELD_PARAMS,
  createGrassEffect,
  createSurfaceSource,
} from 'weft-sdk/three'
import { seedCursor } from 'weft-sdk/core'

const scene = new THREE.Scene()

const surface = createSurfaceSource({
  cacheKey: 'hello-weft',
  units: ['|', '/', '\\'],
  repeat: 24,
})

const grass = createGrassEffect({
  seedCursor,
  surface,
  initialParams: {
    ...DEFAULT_GRASS_FIELD_PARAMS,
    layoutDensity: 8,
  },
})

scene.add(grass.group)
```

## Deterministic world fields

For larger authored worlds, use `weft-sdk/core` world fields to drive masks and density without inventing a separate scatter pipeline:

```ts
import {
  DEFAULT_TREE_FIELD_PARAMS,
  createTreeFieldEffect,
  getPreparedTreeSurface,
} from 'weft-sdk/three'
import { createWorldField, seedCursor } from 'weft-sdk/core'

const forestSignal = createWorldField(17, {
  scale: 28,
  roughness: 0.55,
  warpAmplitude: 9,
})

const trees = createTreeFieldEffect({
  seedCursor,
  surface: getPreparedTreeSurface(),
  initialParams: DEFAULT_TREE_FIELD_PARAMS,
  placementMask: {
    bounds: { minX: -64, maxX: 64, minZ: -64, maxZ: 64 },
    includeAtXZ: (x, z) => forestSignal(x, z) > 0.58,
  },
})
```

## Shared execution for presets and custom effects

Every shipped preset uses `SurfaceExecutionRuntime`, the same execution kernel
under the custom surface runtime. It caches authored rows, schedules projection
passes and releases owned instance buffers. Grass keeps its spatial blade cache;
trees keep their multiple meshes; the book keeps its glyph buckets. Continuously
deforming globe widths stream through the shared layout driver instead of
retaining rows that change every update.

Presets expose `getRuntimeStats()` for cache/pass counts. Static field presets
cache terrain projection: keep the ground-height callback stable between frames,
and call `effect.invalidate()` after changing terrain or placement callbacks in
place. `setParams()`, supported source setters, and reactions invalidate their
dependent work automatically. Camera culling still follows mutable camera data.

Run `npm run check:presets` for the pinned before/after comparison across all
families, shell/band variants and the three landscape looks. See
[preset verification](tests/PRESETS.md) for measurements and native WebGPU checks.

`createSurfaceEffect()` retains its source/layout configuration and now provides
`createRuntime()`. Custom effects can use the same layout cache, dirty-row updates,
visibility handling, recoverable damage and partial instance uploads:

```ts
import * as THREE from 'three'
import {
  createSurfaceEffect, createSurfaceSource, fieldLayout,
  recoverableDamage, threeInstancedMeshRenderer,
} from 'weft-sdk/three'

const definition = createSurfaceEffect({
  id: 'custom-ground',
  source: createSurfaceSource({ cacheKey: 'custom-ground', units: ['|', '/', '\\'], repeat: 40 }),
  layout: fieldLayout({ rows: 32, sectors: 32, advanceForRow: row => row * 13 + 5 }),
  renderer: threeInstancedMeshRenderer({
    geometry: new THREE.BoxGeometry(0.08, 0.4, 0.08),
    material: new THREE.MeshBasicMaterial({ color: '#74a87b' }),
    maxInstances: 8000,
  }),
  behaviors: [recoverableDamage({ radius: 2, recoveryRate: 0.5 })],
})
const effect = definition.createRuntime({
  spanMin: -16,
  spanMax: 16,
  lineCoordAtRow: row => row - 16,
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
scene.add(effect.group)
effect.update(elapsedSeconds) // Call before rendering; idle poses stay cached.
effect.addImpact(0, 0)        // Span/line coordinates, before world projection.
effect.invalidateRows(8, 10) // Rebuild rows [8, 10) after changing authored inputs.
// effect.dispose() when removing it from the scene.
```

Use `invalidate()` after changing inputs for the whole surface, or
`invalidateRows(start, end)` for a row interval. Width changes can reflow later
sectors, so a complete row is the dependency unit. A visibility predicate is
checked every update without changing authored glyph identities. Shader uniforms
can advance through `onFrame(time, delta)` while poses remain cached; time-driven
CPU poses need explicit invalidation. `getStats()` and `getLayoutStats()` expose
work counts. Capacity overflow throws rather than silently dropping cells.

Meshes and instance buffers belong to the runtime. Geometry/material are borrowed
unless `disposeResources: true`; textures remain caller-owned. The runtime currently
executes `recoverableDamage`; other behavior descriptors produce an explicit error.

## Core cache lifecycle

Prepared sources replace an existing cache entry when glyph definitions, weights,
font, repeat count or metadata identity changes. Cached palette definitions are
snapshotted; metadata is caller-owned. Each source/text cache defaults to 128 entries
and 1,000,000 UTF-16 text units. This is a retention budget, not a heap-byte estimate.

```ts
import {
  configureSurfaceCaches, getSurfaceCacheStats,
  releaseSurfaceSource, clearSurfaceCaches,
} from 'weft-sdk/core'

configureSurfaceCaches({ maxEntries: 64, maxTextUnits: 500_000 })
console.log(getSurfaceCacheStats())
releaseSurfaceSource('custom-ground')
clearSurfaceCaches()
// After fonts change, optionally also clear shared Pretext measurement caches:
clearSurfaceCaches({ measurements: true })
```

Eviction/release never invalidates handles held by live effects. Replace metadata
objects or release the key when revising definitions; existing prepared handles
keep their authored layout. Built-in cursor seeds use weakly owned, bounded
checkpoints and detect the source's rewind period. Custom seed callbacks retain
their original invocation semantics.

Motion and accelerating recovery integrate the full delta instead of dropping
time above 50 ms. `motion.sampleInto(x, z, target)` avoids allocating a sample
object in hot loops; `sample()` remains available.

## Learn more

- For full preset/API detail, use the SDK docs page powered by `src/Docs.tsx`.
- For AI/codegen context, use [`weft.md`](./weft.md).
- For additional preset ideas, see [`preset-ideas.md`](./preset-ideas.md).

## Local development

Node.js 20+ is recommended.

```bash
npm install
npm run dev
```

The local site is WebGPU-only.

Grass wind runs on the GPU. Unchanged visible cells skip CPU matrix and color
updates, while disturbances update affected cells and restore them after recovery.
Camera culling uses the full authored placement cache, so newly visited areas keep
their grass. Presets upload live buffer ranges rather than their entire capacities.

The default grass density is now `8` (previously `200`); explicit overrides still
work. Grass blades have grounded roots and fewer triangles. Tree and shrub foliage
uses folded leaves, varied branch elevations, crown normals, and independent burn
attributes. Low tree/shrub densities also thin the population below one glyph per slot.

For reproducible browser checks, open `/tests/browser.html` with the dev server
running. See [performance validation](./tests/PERFORMANCE.md) for measured CPU
costs, comparison setup, and limitations.

Core verification is independent of the game scenes:

```bash
npm run check:core
# Optional: save a benchmark report or compare a different local Git revision.
npm run bench:core -- --output validation.local/core-benchmark.json
npm run bench:core -- --baseline <old-commit>
```

The benchmark uses isolated Node processes and deterministic test font metrics.
It reports median/p95 CPU timings plus stable work/memory regression gates. Open
`/tests/core-browser.html` for the same correctness suite with native browser
measurement and a real WebGPU draw. See [core benchmark notes](./tests/CORE.md).

## Credits

- Layout and measurement: [Pretext](https://www.npmjs.com/package/@chenglou/pretext)
- Rendering: [Three.js](https://threejs.org/)

## License

[MIT](LICENSE)
