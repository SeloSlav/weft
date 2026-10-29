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

There are 35 configurations: all 14 executable preset classes, the three band
appearances, five shell appearances, and all five constituent families of each
meadow/woodland/autumn look. Fixtures use their authored SDK densities, seed 17,
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
reaction update, and clear. Cases without an interaction API repeat an ordinary
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

Reports contain median and p95 timings, work counts and upload-version changes.
Timings are observations; the six deterministic gates are what fail the command:
every family uses the shared kernel, its cache/pass scheduler is reused, output
hashes match, static idle uploads are zero, stable idle rows do not reflow, and
every owned instance buffer is disposed with cached rows released.

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
| band-generic / idle | 0.2316 | 0.0004 |
| shell-fish / active | 0.4376 | 0.2727 |
| shell-shutter / active | 0.4108 | 0.2453 |
| shell-ivy / active | 0.4269 | 0.2497 |
| fire / active | 0.6595 | 0.5786 |
| stars / active | 0.8699 | 0.6811 |
| book / active | 0.1265 | 0.0010 |
| grass / active | 3.3446 | 3.5648 |
| autumn/grass / active | 1.1106 | 1.3390 |

The active grass samples are slower in this run; the data does not establish an
across-the-board active-simulation improvement. Grass retains its spatial fast
path and avoids a duplicate row cache. The shared benefits are cached idle work,
consistent lifecycle, and cheaper reconfiguration where rows can be reused.

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

Open `/tests/presets-browser.html` and run all checks. This repeats all 35 output
comparisons using native browser metrics, draws every migrated preset through
WebGPU, and verifies consumed instance upload ranges. Seven further checks cover
terrain invalidation, needle visibility movement/restoration, and repeated source
replacement in all five mutable-source families. Its preview selects each preset
and its reaction at fixed seed, camera, 960 × 540 resolution and DPR 1.

`/tests/core-browser.html` also runs 23 core checks plus a native partial-upload
check. `/tests/browser.html` retains the 11 existing grass/camera/burn/foliage and
WebGL/WebGPU regressions. All 77 native checks passed during migration validation.
