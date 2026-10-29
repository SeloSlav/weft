# Animation delta and uniform-stream benchmarks

Run `npm run bench:animation-deltas` to compare complete binary frames, stateless verified deltas, and the stateful uniform fast path. Pass `-- --output <path>` to save the report elsewhere. The [full sample](./benchmarks/animation-delta-results.json) includes p95 and process CPU measurements; [three independent runs](./benchmarks/animation-uniform-stream-results.json) record the uniform fast path and active grass costs. The earlier [delta CPU comparison](./benchmarks/animation-delta-cpu-results.json) is retained.

## Wind-only fast path

Three sequential paired runs used 128,298 default grass instances. The keyframe had already been applied and acknowledged. Each stateless sample captured a full frame and encoded a verified WFD1 delta; each fast-path sample captured an absolute uniform update, checked tracked render state and encoded a verified WUS1 packet. Both advanced shader wind; stream ticks increased for each packet. On receive, the prior path verified, reconstructed and applied the full state, while the stream verified and applied uniforms only. Timings exclude effect update, rendering, transport and keyframe setup.

| Work | Stateless delta median elapsed | Uniform stream median elapsed |
| --- | ---: | ---: |
| Capture and encode | 11.40–13.04 ms | 0.11–0.18 ms |
| Verify and apply | 11.97–12.75 ms | 0.16–0.21 ms |

Uniform packets were 304 bytes; the stateless WFD1 wind packet was 3,328 bytes. Both paths delivered matching uniform state, and the stream caused no instance-matrix, color or geometry-attribute version changes. The fast path's sample p95 ranged from 0.25–0.34 ms for encoding and 0.24–0.30 ms for replay. These are batched CPU-side observations on one Windows x64 / Node v24.22.1 machine, not a 60 fps or GPU guarantee. Process CPU is reported in the JSON; a separate 512-operation batch measured 0.04–0.05 ms per encode and 0.04–0.05 ms per replay, but Windows accounting is coarse and subject to GC and background worker noise.

The fast path applies only while tracked geometry, transforms and buffer versions stay unchanged. The benchmark applies a disturbance and confirms the stream requests a new keyframe. In these runs, rebuilding a stream required an 11,380,500-byte keyframe, 8.70–9.06 ms to create and 9.32–9.92 ms to install, excluding network. Continuous interactive deformation can require frequent rekeys; this is not a viable per-frame fast path in that situation. Applications can use the existing stateless delta protocol instead, but its default-density active disturbance still took 12.23–13.14 ms to capture/encode and 12.11–12.90 ms to replay in these runs (521,596 raw bytes). Further incremental geometry work or off-thread processing is needed for tight frame budgets.

## Full frame and stateless delta

Each case captures consecutive simulation states at 0.05 and 0.10 seconds. The WFD1 path includes full capture, change detection and two SHA-256 digests; replay includes verification, reconstruction and application. Each comparison uses two warmup samples and seven alternating paired samples, batched by workload. The frozen [baseline fixture](./fixtures/animationDeltaBaseline.ts) has SHA-256 `be2e99abe58376f797b24cea28b7341f7c1e11001de8683041bb11a8c05ee023` and uses the current binary capture and application code. Both implementations emit byte-for-byte identical packets. Deterministic font metrics are used; measurements exclude compression, network and GPU work.

The final Windows x64 sample measured these median elapsed times:

| Effect | Full bytes | Delta bytes | Encode before → after (ms) | Replay before → after (ms) |
| --- | ---: | ---: | ---: | ---: |
| Fungus, active | 7,424 | 1,440 | 0.097 → 0.069 | 0.109 → 0.063 |
| Grass, default, wind only | 11,380,500 | 3,328 | 24.932 → 11.708 | 18.496 → 11.720 |
| Grass, low, active disturbance | 1,957,276 | 90,532 | 5.065 → 3.053 | 4.117 → 3.130 |
| Grass, default, active disturbance | 11,380,500 | 521,596 | 27.116 → 13.171 | 20.031 → 12.977 |
| Leaf pile, active | 66,484 | 1,336 | 0.298 → 0.185 | 0.265 → 0.165 |
| Shutter shell, active | 190,332 | 45,768 | 0.665 → 0.421 | 0.584 → 0.392 |
| Fire, active | 183,500 | 162,872 | 0.959 → 0.687 | 0.770 → 0.549 |
| Fungus, full-change fallback | 7,424 | 7,424 | 0.083 → 0.078 | 0.033 → 0.034 |

Stateless deltas scan and hash full frames and can cost more CPU than a full frame. The encoder returns a full keyframe when a delta would not be smaller in raw bytes, but does not predict gzip size. In this sample, fire's gzip sizes were 64,934 bytes for the full frame and 76,174 bytes for the delta.

Gates require exact reconstructed bytes and applied state, identical baseline/current WFD1 packets, a packet no larger than a full frame, wind-only reduction, uniform parity, no buffer writes and detection of disturbance. Timing is informational. `npm test` also covers incorrect or missing baselines, corrupted packets, keyframe and stream identity mismatches, dropped and stale uniform updates, buffer revisions, concurrent operations, output limits, async caller mutation, unaligned buffers and randomized delta transitions. Browser and GPU behavior are not measured here.
