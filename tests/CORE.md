# Core verification and benchmarks

Run the complete repeatable check with:

```bash
npm run check:core
```

This runs TypeScript, the automated core correctness suite, and isolated-process
before/after CPU benchmarks. No game scene, browser installation or GPU is needed.
The test build tool resolves through the already-declared `tsup` dependency, so
strict pnpm layouts do not need an undeclared top-level esbuild package.

## Measurement contract

`npm run bench:core` bundles the current SDK and a pinned local Git baseline
(`27dad3cc9cafbaecdff3f36140261e2e3a0ff562`) separately. Each runs in its own Node
process with explicit GC support. They share the installed dependency versions
and deterministic OffscreenCanvas test metrics. Pretext still performs real
segmentation and line breaking. These metrics make correctness and relative CPU
work repeatable; they do not measure native font preparation, rendering or GPU time.

Override the baseline with `--baseline <local-git-ref>` and save reports with
`--output <path>`. The default report is ignored at
`validation.local/core-benchmark.json`. The pinned commit must exist locally;
shallow checkouts need its history. The committed sample report is
[`benchmarks/core-results.json`](./benchmarks/core-results.json).

Timings include warm-up, median and p95. Timing ratios are observations, not CI
thresholds: hardware, Node/JIT, GC and background work affect them. Deterministic
operation and retention gates determine success/failure:

- Seeding work is bounded by the furthest advance plus checkpoint lookup work,
  rather than the sum of every row's advance.
- A warm stable 4,096-slot layout performs zero line-breaking calls.
- Idle custom-runtime updates project zero instances and request zero buffer writes.
- Invalidating one of 64 rows projects at most 1/32 of a full invalidation (the
  fixture actually projects 1/64).
- Source and text caches each retain at most 128 entries.

## Workloads

| Case | Inputs | What it verifies |
| --- | --- | --- |
| Cold row seeds | 64/128/256/512 rows, advances `13 * row + 5` | Prefix reuse and scaling |
| Periodic source | 10 glyphs repeated 50 times | Detected rewind period avoids repeated traversal |
| Long source | Same glyphs repeated 5,000 times | Checkpoint reuse also helps before a rewind occurs |
| Warm traversal | 64 × 64 slots, exact distinct widths | Per-slot cache prevents a 2,048-entry LRU from thrashing |
| Motion sampling | 10,000 queries over 64 packets, 75% outside footprints | Squared-distance rejection and caller-owned sample storage |
| Source retention | 2,048 unique keys sharing text/font | Cache limits, WeakRef survivors after GC, and heap delta |
| Shared runtime | 64 × 32 slots, 6,144 instances | Idle, dirty-row and full-invalidation work |

The cache heap delta includes dependency/runtime retention and is advisory.
WeakRefs are collected only after advancing the event loop; source counts refer
to the 2,048 requested benchmark sources, not all objects in the process.
Text-unit limits count retained UTF-16 source text, not JS heap bytes. Metadata
and handles still held by applications remain their responsibility. Pretext's
shared font caches can be explicitly cleared separately.

## Recorded sample

The committed Windows x64 / Node 24 sample reports these CPU medians:

| Workload | Before | After |
| --- | --- | --- |
| Cold seeding, 256 rows, long source | 396.67 ms | 4.42 ms |
| Warm 4,096-slot traversal | 10.96 ms | 1.95 ms |
| 10,000 motion samples over 64 packets | 14.39 ms | 2.40 ms |
| Uncached source preparation, shared font metrics | 6.94 ms | 6.95 ms |
| 1,000 cached source lookups | 7.06 ms | 8.94 ms |

Input validation adds work to cached source lookup; keep prepared handles across
frames. The source-retention case kept 128 of 2,048 requested sources after GC,
compared with all 2,048 in the baseline. Idle shared-runtime updates performed
zero projection/buffer writes. Editing one row projected 96 instances versus
6,144 for full invalidation. The full JSON includes p95, source-size variants,
heap deltas, operation counts and the five regression-gate results.

The execution benchmark includes CPU layout, projection, matrix/color copies and
marking upload ranges. It does not submit GPU commands. A full invalidation is an
explicit reference workload; the old library had no shared runtime to compare.

## Correctness coverage

`npm test` covers camera-independent token identity, hidden-prefix width changes,
exact-width caches, callback isolation, Unicode graphemes, rewind and checkpoint
eviction, source replacement and bounded retention, custom seed callback behavior,
motion/recovery at multiple frame rates, long deltas, allocation-free samples,
runtime idle/partial updates, completely culled fields, impacts, source replacement,
resource ownership, disposal and capacity errors.

For native browser/font measurement and real WebGPU uploads, run the dev server
and open `/tests/core-browser.html`, then click **Run core checks**. The page also
exposes row edits, visibility and damage on a custom effect built through the new
shared runtime. `/tests/browser.html` retains the existing preset regression suite.

## Compatibility and limits

Visibility predicates now suppress emission/decoding, while widths are evaluated
for hidden slots so their cursors still advance. Do not use a side effect in a
visibility predicate to mutate widths. Intentional zero-width removal still
reflows the row. Custom effects opt into the shared runtime through
`definition.createRuntime(options)`. Existing preset classes now share its
execution kernel while retaining specialized motion/appearance projectors.
See [preset verification](./PRESETS.md) for the migration, callback invalidation
contract, and per-preset comparisons.

Source reuse now checks definitions, font, repeat and metadata identity. Metadata
objects are borrowed, and prepared token definitions are snapshots. Configuration
fields of a created runtime are snapshotted; callbacks may read captured changing
values, with explicit invalidation for authored pose/width changes. Projection
targets are borrowed per callback. Unsupported behavior descriptors throw.

Analytic core motion and recovery consume full elapsed time. Specialized preset
physics may still choose their own simulation step policies. The shared runtime
invalidates whole rows because width changes can affect later sectors; it does not
promise arbitrary constant-cost changes to a single glyph. Visible-set changes
repack cached instance data, and initial preparation still costs work proportional
to the authored field.
