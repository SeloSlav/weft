# Preset runtime verification

```bash
npm run check:presets
# Or just compare presets and save a report:
npm run bench:presets -- --output validation.local/preset-benchmark.json
```

The baseline is pinned to `035a56bb4a8f7cb7bcf8ecdc2baf269e7e359d6e`, immediately
before preset migration. Override it with `--baseline <local-git-ref>`; the commit
must exist locally. No dependencies or browser installation are needed for the
CPU benchmark. It uses the build tool already declared by `tsup`.

## Coverage and method

There are 37 configurations: all 14 executable preset classes, the three band
appearances, five shell appearances, and all five constituent families of each
meadow/woodland/autumn look, plus dense log and stick workloads. Standard fixtures use their authored SDK densities, seed 17,
the same terrain and matched elapsed times. No instance reductions are introduced
to obtain a speedup.

The runner bundles baseline and current sources separately. A fresh worker loads
both, keeping their SDK caches independent while sharing installed Three.js and
the deterministic text-measurement backend. Each timing sample alternates AB/BA
order, reducing drift from CPU load, JIT and thermal changes between processes.
Texture drawing is a no-op in Node; glyph texture dimensions still use test text
metrics. These are CPU timings, not GPU time, native font measurements or FPS.

For every case the runner compares byte hashes of complete active instance
matrices/colors, geometry attributes including burn channels, counts, and mesh
transforms at six matched states: initial, idle, parameter refresh, damage,
reaction update, and clear. Grass also checks overlapping disturbances and burns,
recovery, moving culling, and restoration. Cases without an interaction API repeat an ordinary
update for the damage stages. Book interaction uses a stationary nearby player.

Timing phases are reported separately:

- Cold update is one observation, excluding construction and texture creation.
- Idle follows initial pose settling, with 15 warm-up updates and 25 batches of
  20 updates. Fire and stars continue animating during this phase.
- Refresh reapplies the same parameter values before each update, measuring
  unnecessary/repeated application configuration and warm projection. Grass
  already avoids rebuilding for identical parameters.
- Active adds a reaction where supported and measures 25 following updates after
  warm-up. Ongoing deformation, physics and recovery keep their original cadence.
- Activation isolates adding an impulse and finding affected log/stick placements;
  it deliberately excludes subsequent physics. It uses internal diagnostic access
  to reset the pending impulse and state between samples.

Reports contain median and p95 timings, work counts and upload-version changes.
Timings are observations; the deterministic gates are what fail the command:
every family uses the shared kernel, its cache/pass scheduler is reused, output
hashes match, static idle uploads are zero, stable idle rows do not reflow, and
every owned instance buffer is disposed with cached rows released, and the same
number of placements activate in the impulse fixture.

For the spatial tracker comparison against the pre-change revision:

```bash
npm run bench:presets -- --baseline 6db124574458488456b1e2f532168d28d19c365a --output tests/benchmarks/spatial-results.json
```

The [sample report](./benchmarks/spatial-results.json) records both elapsed time
and the number of placement candidates. Dense sticks examined 454 of 5,600
placements, with a 0.0502 → 0.0242 ms median for impulse activation. Dense logs
examined 5 of 280, with a 0.0016 → 0.0013 ms median. These CPU samples are short;
they are not frame-time or GPU benchmarks. Small log fields use a direct scan.
The point index is rebuilt with placements and returns candidates in authored
order; precise distance tests and existing physics remain unchanged.

Tree and shrub burns target instance IDs rather than spatial impulses. Leaf piles,
fungus and needle litter currently reproject visible content during reactions;
local updates there would first need persistent placement and output-index caches.
Book glyphs are bucketed and compacted when hidden, so applying a spatial index
there also requires preserving bucket order and shifted output indices.

The committed sample is [preset-results.json](./benchmarks/preset-results.json).
Sub-microsecond idle ratios are dominated by call overhead and timer precision.
Already optimized grass, rock, log, stick, shrub and tree paths should be judged
by absolute time and work counts. Shared lifecycle/caching does not guarantee a
speedup in every active simulation or parameter-refresh sample; neutral and
slower samples remain in the report.

## Recorded paired sample

Windows x64 / Node 24 CPU medians from the committed report:

| Preset / phase | Before (ms) | After (ms) |
| --- | ---: | ---: |
| band-generic / idle | 0.2542 | 0.0006 |
| shell-fish / active | 0.4580 | 0.2718 |
| shell-shutter / active | 0.4250 | 0.2576 |
| shell-ivy / active | 0.4879 | 0.2798 |
| fire / active | 0.7431 | 0.6383 |
| stars / active | 1.0384 | 0.8245 |
| book / active | 0.1302 | 0.0010 |
| grass / active | 4.8376 | 4.1156 |
| autumn/grass / active | 1.6243 | 1.3403 |

The grass reaction pass now restricts candidates to actual influence bounds and
uses generation-marked indices to deduplicate work. Previously affected blades
still update when effects shrink or clear. A separate paired comparison against
commit `1f636c06afe8d72bfb6a163ae8f6fb15f32170a2` is saved in
[grass-results.json](./benchmarks/grass-results.json); its active grass medians
improved in all four fixtures. The marks use 4 bytes per blade capacity, about
1.12 MB per grass effect. Timings vary by machine and do not measure GPU time.

## Runtime contract

All presets and `SurfaceEffectRuntime` use `SurfaceExecutionRuntime`. Preset
projectors retain their own geometry, multi-mesh outputs, glyph buckets, physics
and spatial blade cache. Grass streams layout only when its authored blade cache
needs rebuilding, avoiding a duplicate row cache in its hot path. Cached rows
preserve authored cursor advancement through
hidden sectors. Continuously changing spherical-glass widths stream through the
shared driver, avoiding a second cache that cannot be reused.

Static fields now cache terrain projection. Reuse the ground-height callback
between frames, and call `effect.invalidate()` when terrain/placement callbacks
change in place. A new ground-height callback also refreshes projection. Parameter
and supported source setters refresh their dependencies. Reactions run through
their final recovery frame; moving view culls and returning to an uncropped field
refresh visibility. `getRuntimeStats()` exposes rebuilt/replayed rows and
executed/skipped passes. `dispose()` releases row caches and instance buffers;
preset-specific geometry/material disposal remains explicit. Book glyph textures
and its plane geometry are shared, so disposing one book preserves another book's
borrowed assets.

## Native fonts and WebGPU

```bash
npm run validate:baseline -- 035a56bb4a8f7cb7bcf8ecdc2baf269e7e359d6e
npm run dev -- --host 127.0.0.1
```

Open `/tests/presets-browser.html` and run all checks. This repeats all 37 output
comparisons using native browser metrics, draws every migrated preset through
WebGPU, and verifies consumed instance upload ranges. Seven further checks cover
terrain invalidation, needle visibility movement/restoration, and repeated source
replacement in all five mutable-source families. Its preview selects each preset
and its reaction at fixed seed, camera, 960 × 540 resolution and DPR 1.

`/tests/core-browser.html` also runs 24 core checks plus a native partial-upload
check. `/tests/browser.html` retains the 11 existing grass/camera/burn/foliage and
WebGL/WebGPU regressions.
