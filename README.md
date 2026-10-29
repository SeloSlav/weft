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

## Portable placement

By default, palette layout uses Pretext and the available fonts, so placement can
change with font metrics and browser text layout. To make the authored token and
row layout independent of those metrics, opt into fixed advances:

```ts
import { makeSurfacePortable, seedCursor } from 'weft-sdk/core'
import { createGrassEffect, buildGrassStateSurface } from 'weft-sdk/three'

const surface = makeSurfacePortable(buildGrassStateSurface(0))
const grass = createGrassEffect({ surface, seedCursor })
```

This works with the built-in palette sources and custom palette sources prepared
with `createSurfaceSource()` or `prepareSurfaceText()`. `tokenAdvance` (default
12) and `spaceAdvance` (default 6) set fixed layout widths; they may change the
appearance and density compared with the measured layout. Tokens are treated
as opaque strings, so composite Unicode glyphs are not split by the browser.
Palette tokens must be nonempty and contain no whitespace. A palette source's
repeat count is retained; for a manually assembled source, pass `{ repeat }`.
Use the SDK's built-in `seedCursor`: custom cursor factories are rejected for
portable sources because their cursor semantics may depend on Pretext.

The book preset uses literal prose rather than a repeated palette. Its portable
variant accepts an explicit list of glyph tokens so the caller controls Unicode
segmentation. A space token advances the cursor and a newline token starts a new
row; wrapping occurs at token boundaries, including within words. Other
whitespace within tokens is rejected:

```ts
import { createBookPageEffect, createPortableBookPageSurface } from 'weft-sdk/three'
import { seedCursor } from 'weft-sdk/core'

const tokens = [...Array.from('A fixed page\n'), '👩‍👩‍👧‍👦']
const surface = createPortableBookPageSurface('page-1', tokens)
const page = createBookPageEffect({ surface, seedCursor, wallWidth: 12, wallHeight: 8 })
```

Portable mode makes layout independent of native font measurements and browser
grapheme segmentation for the supplied tokens. Use the same SDK version, input
tokens, parameters, callbacks and update sequence on each machine. It does not
make caller-provided terrain or masks deterministic, standardize font artwork,
or guarantee bit-identical floating-point transforms and animated simulation on
every JavaScript engine. Use authoritative placements if exact synchronization
is required. Preparing a source still requires the normal Pretext environment;
the exposed `prepared` handle continues to describe native measured text and
must not be used to reproduce portable cursor layout with Pretext directly.

`npm run test:portable` compares placement across deliberately different font
metrics and browser-profile simulations. For a native check, run the development
server and compare the results from `/tests/portable-browser.html` in each
browser; these checks do not establish identical rendering across devices.

To make simulation steps independent of rendering cadence, drive effects with
`FixedStepClock` and assign gameplay events to shared integer ticks:

```ts
import { FixedStepClock } from 'weft-sdk/runtime'

const clock = new FixedStepClock({ ticksPerSecond: 60, maxStepsPerAdvance: 600 })
// targetTick and the events for each tick must come from the same timeline on each peer.
const result = clock.advanceTo(targetTick, (tick, elapsedSeconds) => {
  applyEventsForTick(tick)
  grass.update(elapsedSeconds)
})
// If result.complete is false, call advanceTo(targetTick, ...) again to catch up.
```

The first step is tick 0. The clock never silently drops steps, does not support
rewinding, and leaves a failed tick uncommitted; the callback must handle any
partial side effects if it throws. Matching ticks and event ordering alone do not
guarantee bit-identical simulation across different CPU or GPU math implementations.

For exact CPU-side transforms, one authoritative simulation can send frames to
replicas. Each frame contains root-first local object transforms, visibility,
instance counts and live instance matrices as JSON-safe IEEE bit patterns:

```ts
import { captureSurfaceTransformFrame, applySurfaceTransformFrame } from 'weft-sdk/three'

// Authority: update the effect, then send JSON.stringify(frame) with its tick.
const frame = captureSurfaceTransformFrame(authorityEffect.group, tick)
// Replica: build the same effect hierarchy and apply received frames in tick order.
applySurfaceTransformFrame(replicaEffect.group, JSON.parse(message))
```

Do not independently update the replica effect: applying a frame sets
`matrixAutoUpdate = false` on its nodes so the received local matrices are used
as-is. The receiver must discard stale/out-of-order frames, and matching effect
hierarchies, materials, geometry and ancestor transforms are the application's
responsibility. The frame checks node types, names, child counts and instance
capacities before applying it. It invalidates instance bounds and schedules matrix
uploads. Full frames are uncompressed and can be large for dense fields; use a
transport appropriate to that cost or synchronize a smaller authoritative set.

These frames synchronize **transforms only**. They do not synchronize gameplay
state, instance colors and other attributes, deformed vertex buffers, material
uniforms, textures, shader-driven grass wind, or GPU results. Replicate those
separately when needed. Different GPUs can still render the same inputs differently;
exact independent simulation and pixel-identical animation are not guaranteed.

For animated rendering, use the larger animation frame instead:

```ts
import { captureSurfaceAnimationFrame, applySurfaceAnimationFrame } from 'weft-sdk/three'

const frame = captureSurfaceAnimationFrame(authorityEffect, tick)
// Send JSON.stringify(frame), then apply it to an initialized replica:
applySurfaceAnimationFrame(replicaEffect, JSON.parse(message))
```

Animation frames include the transform frame, geometry attributes (including
deformed positions and normals), live instance colors and per-instance attributes
such as grass wind phases and burn rims. They also carry the exposed shader
inputs for grass wind and shell breaches. Replica effects must be created with
the same hierarchy and compatible geometry, initialized, and then driven only by
received frames. As with transform frames, apply frames in order and keep the
replica's external ancestor transforms consistent. The whole frame is checked
before application; incompatible schemas and unsupported attribute formats fail
explicitly. Custom effects may expose numeric shader values through
`getAnimationUniforms`, `validateAnimationUniforms`, and `setAnimationUniforms`.
Custom validators should reject invalid values before application; a custom
setter that throws can leave a frame partially applied.

Animation frames currently require non-interleaved Float32 attributes and do not
support skinned meshes or morph attributes. They do not carry geometry indices,
textures, material properties, arbitrary uniforms or gameplay state. Full frames
are uncompressed and can be very large for dense effects. They reproduce the
authoritative CPU buffers and wind inputs; GPU arithmetic and rasterization can
still differ between hardware or drivers, so pixel-identical rendering and exact
independent simulation are not guaranteed.

For smaller, faster-to-serialize full frames, use the binary transport instead:

```ts
import { captureSurfaceAnimationBinary, applySurfaceAnimationBinary } from 'weft-sdk/three'

const bytes = captureSurfaceAnimationBinary(authorityEffect, tick) // Uint8Array
socket.send(bytes)
// On the replica, when the binary message is received as an ArrayBuffer:
applySurfaceAnimationBinary(replicaEffect, new Uint8Array(event.data))
```

The binary format carries the same state and bit patterns as the JSON frame and
uses explicit little-endian 32-bit blocks. Each frame is self-contained; it is
not compressed, and callers must handle ordering, delivery and transport
integrity. Pass the `Uint8Array` itself when sending so a subarray's
offset and length are respected. Malformed or incompatible frames are checked
before they modify the replica. See [animation frame benchmarks](tests/ANIMATION-FRAMES.md)
for workload sizes, CPU costs and gzip comparisons.

For ordered streams, encode changes against the last **acknowledged** full binary
frame. Keep the corresponding reconstructed frame on the receiver:

```ts
import { captureSurfaceAnimationBinary, encodeSurfaceAnimationDelta,
  applySurfaceAnimationDelta } from 'weft-sdk/three'

// After sending an initial WFA1 keyframe and receiving its acknowledgement:
const next = captureSurfaceAnimationBinary(authorityEffect, tick)
const packet = await encodeSurfaceAnimationDelta(acknowledgedFrame, next)
socket.send(packet)
// Promote next to acknowledgedFrame only after the receiver confirms application.

// Receiver, processing packets sequentially:
previousFrame = await applySurfaceAnimationDelta(replicaEffect, previousFrame, packet)
```

The encoder returns a full WFA1 keyframe automatically if a delta would be no
smaller; the receiver accepts either format. For the initial keyframe, pass
`null` as `previousFrame`. Deltas verify SHA-256 digests of the required baseline
and reconstructed result before application. A missing, stale, corrupted or
wrong baseline is rejected: request a new keyframe to recover. Process each
stream sequentially and keep the returned bytes unchanged for its next baseline.
Verification requires Web Crypto in a secure browser context. SHA-256 checks
identity and accidental corruption; it does not authenticate the sender. Full
keyframes have no delta checksum, so use an integrity-protected transport.
The decoder defaults to a 256 MiB limit for the packet and both frames; pass
`{ maxFrameBytes }` to change it. Deltas require scanning and hashing full frames
and allocating reconstruction buffers, so smaller packets can cost more CPU.
See [delta benchmarks](tests/ANIMATION-DELTAS.md) for the measured tradeoff.

When only exposed shader uniforms change, a stateful uniform stream avoids
capturing, scanning and reapplying the full frame on every tick:

```ts
import { createSurfaceAnimationUniformEncoder, createSurfaceAnimationUniformDecoder,
  SurfaceAnimationKeyframeRequiredError } from 'weft-sdk/three'

// Authority: send and acknowledge both keyframe and streamId before updates.
let { encoder, keyframe, streamId } = await createSurfaceAnimationUniformEncoder(authorityEffect, tick)
// Receiver, after getting the matching keyframe and streamId:
let decoder = await createSurfaceAnimationUniformDecoder(replicaEffect, keyframe, streamId)

// After advancing authorityEffect, while geometry and transforms remain unchanged:
try {
  const packet = await encoder.capture(nextTick)
  // Send packet; receiver processes it sequentially with await decoder.apply(packet).
} catch (error) {
  if (!(error instanceof SurfaceAnimationKeyframeRequiredError)) throw error
  // Stop this stream, create and acknowledge a new keyframe and streamId,
  // then replace both encoder and decoder before sending more uniform packets.
}
```

Uniform packets contain absolute values, so a later packet can replace a lost
one; stale ticks, wrong stream IDs, wrong keyframes and corrupt packets are
rejected. Only one capture or apply may be in flight per stream. Stream IDs and
SHA-256 checks are not sender authentication; use a protected transport. The
decoder's default keyframe limit is 256 MiB, adjustable with
`{ maxFrameBytes }` as its fourth argument.

The fast path checks object transforms, visibility, instance counts, buffer
identities and Three.js attribute versions. **Every direct buffer mutation must
set `attribute.needsUpdate = true`**, and the decoder must be the only writer to
replica render state. Unmarked in-place mutations cannot be detected without a
full scan. Custom uniform getters and setters should be side-effect free. The
stream does not synchronize textures, material properties, geometry indices,
unexposed uniforms or gameplay state, and it retains the existing Float32,
non-interleaved geometry restrictions. Shared geometry and external ancestor
transforms remain the application's responsibility.

This fast path is for stable render buffers, such as shader-only wind. A burn,
disturbance, terrain edit, buffer upload or transform change requires a fresh
keyframe; it is not a low-cost solution for continuous changing geometry. You can
instead use the patch stream below for active buffer changes. A new stream must
begin from an acknowledged keyframe.

For interactions that change instance or geometry buffers, the patch stream
keeps a private copy of the authority's live buffer words and sends lossless
sparse changes. It applies those changes directly to the replica:

```ts
import { createSurfaceAnimationPatchEncoder, createSurfaceAnimationPatchDecoder,
  SurfaceAnimationKeyframeRequiredError } from 'weft-sdk/three'

// Deliver and acknowledge the keyframe and stream ID before sending patches.
const { encoder, keyframe, streamId } = await createSurfaceAnimationPatchEncoder(authorityEffect, tick)
const decoder = await createSurfaceAnimationPatchDecoder(replicaEffect, keyframe, streamId)

// Process each stream sequentially. After advancing the authority:
try {
  const packet = await encoder.capture(nextTick)
  // Send packet. On the receiver, await decoder.apply(packet).
} catch (error) {
  if (!(error instanceof SurfaceAnimationKeyframeRequiredError)) throw error
  // Replace the stream with a new keyframe and stream ID on both sides.
}
```

Both sides must also replace the stream if `decoder.apply` reports
`SurfaceAnimationKeyframeRequiredError`: patches depend on earlier buffer
revisions. A lost uniform-only packet can be skipped, but a lost buffer patch
cannot; use ordered delivery and request a keyframe on a missing revision.
Stale packets, corrupt packets and wrong stream IDs or keyframes are rejected.
Only one capture or apply may be in flight per stream. New encoders can emit WPS2
or WPS3 packets; update receivers before senders because older decoders only
accept WPS1. Current decoders also accept WPS1. Packet SHA-256 checks
are not authentication; protect the transport. The decoder defaults to a
256 MiB keyframe limit, adjustable with `{ maxFrameBytes }`; packets are limited
to 256 MiB. Creating a stream copies live buffer data on the sender and takes a
full keyframe, so it consumes additional memory and has a setup cost.

The mutation and replica ownership rules above also apply to patch streams.
Changed Float32 buffers must be marked with `needsUpdate`, even if the renderer
has already cleared their update ranges. Built-in grass records bounded dirty
instance hints so the patch stream can skip untouched regions; missing hints or
intervening untracked revisions fall back to a full comparison. A changed hierarchy, transform, count,
buffer identity, geometry index or uniform schema requires a new keyframe.
Unmarked changes and material, texture, gameplay or external ancestor changes
are outside the stream contract. The [benchmark notes](tests/ANIMATION-DELTAS.md)
show active sender and receiver timings, packet sizes and excluded work.

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
cache terrain projection. Keep the ground-height callback stable between frames.
When terrain or placement callbacks read mutable data, you can supply an
`inputVersion` reader at creation time. Advance the shared revision whenever any
of those inputs changes; the next update refreshes the effect automatically:

```ts
import { createRockFieldEffect } from 'weft-sdk/three'
import { seedCursor } from 'weft-sdk/core'

let terrainRevision = 0
const rocks = createRockFieldEffect({
  seedCursor,
  placementMask: { includeAtXZ: (x, z) => terrain.isAllowed(x, z) },
  inputVersion: () => terrainRevision,
})
// After changing terrain heights or the placement mask's underlying data:
terrainRevision++
rocks.update(elapsedSeconds, getGroundHeight)
```

This option is available on band, fungus, grass, leaf pile, needle litter,
rock, log, stick, shrub, and tree effects. The reader must return a stable
revision (such as a number or string), and change it whenever the data used by
the terrain or mask callbacks changes. Versions are compared with `Object.is`;
mutating an object returned as the version does not change its identity. The
reader is called on updates, so it should be cheap and free of side effects.
Sharing a revision between effects lets one change refresh each effect on its
next update. If no version is supplied, call `effect.invalidate()` after
mutating those inputs. Bounds and callback functions supplied at construction
are captured; changing the original options object does not replace them.
`setParams()`, supported source setters, and reactions invalidate their
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

Custom runtimes also accept `inputVersion: () => revision` in `createRuntime()`
options for mutable layout and projection inputs. A changed version invalidates
the whole surface; use `invalidateRows()` for more targeted updates. The version
reader is also consulted by `needsUpdate()`, which lets an application skip idle
updates without missing a revision change. The caller still has to advance the
revision when its data changes; the runtime cannot inspect callback closures.

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
