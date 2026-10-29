# Animation delta and uniform-stream benchmarks

Run `npm run bench:animation-deltas` to compare complete binary frames, stateless verified deltas, and the stateful uniform fast path. Pass `-- --output <path>` to save the report elsewhere. The [full sample](./benchmarks/animation-delta-results.json) includes p95 and process CPU measurements; [three independent runs](./benchmarks/animation-uniform-stream-results.json) record the uniform fast path and active grass costs. The earlier [delta CPU comparison](./benchmarks/animation-delta-cpu-results.json) is retained.

## Compact patches and sustained interactions

Run `npm run bench:animation-patches-paired -- --output tests/benchmarks/animation-patch-paired-results.json` for the [paired report](./benchmarks/animation-patch-paired-results.json). Three independent, alternating-order runs compare the frozen WPS1 encoder and decoder with the current codec on the same current grass simulation. Each mode runs in its own Node process. After 20 warmup frames, it measures 180 consecutive frames of a recovering disturbance and 180 frames of a moving disturbance on 128,298 grass instances. Sender time includes updating the effect and capturing the patch; replay is a separate receiver operation. End-state bytes match both the authoritative state and the paired run.

| Scenario | WPS1 median packet | Current median packet | Current sender median | Current sender p95 | Current sender maximum |
| --- | ---: | ---: | ---: | ---: | ---: |
| Recovering | 646.7 KiB | 249.6 KiB | 4.99–5.15 ms | 5.97–6.71 ms | 7.58–9.12 ms |
| Moving | 648.7 KiB | 304.6 KiB | 5.11–5.47 ms | 5.82–6.40 ms | 6.66–8.57 ms |

All 1,080 measured sender frames in these runs were below 16.67 ms. This is a headless Windows x64 / Node v24.22.1 result, not a guarantee for an application frame: it excludes other game logic, network, rendering, GPU uploads, stream setup and keyframe recovery. It also does not cover every disturbance pattern or machine. The separate [original comparison benchmark rerun](./benchmarks/animation-patch-compact-results.json), which also runs full-frame delta capture and replay between patch operations, had default-grass sender p95 values of 19.89–22.02 ms and a 25.76 ms maximum. Its sender figure adds two separately measured spans, and the extra full-frame work can affect garbage collection and scheduling; it demonstrates that the isolated result does not hold under all memory pressure. The corresponding current replay medians were 0.92–0.96 ms and 1.12–1.15 ms. The frozen WPS1 sender medians were 4.97–4.99 ms and 4.72–4.85 ms, so the smaller packets have a modest CPU cost in this workload. At 60 packets/s their median raw bandwidth is still about 14.6 MiB/s and 17.8 MiB/s respectively, before transport overhead.

Current packets use bitmasks for changed words, and when smaller, losslessly encode XOR differences against the previous state. The encoder selects absolute sparse words or full blocks when either is smaller. New decoders accept WPS1, WPS2 and WPS3; older WPS1-only decoders cannot read the new formats. Grass records a bounded journal of touched instance blocks; a version gap, unsupported producer, or expired hint forces a complete comparison rather than risking missed changes. The benchmark's frozen WPS1 codec uses the current simulation, so this paired comparison isolates the codec and does not quantify the grass simulation changes.

## Active interaction patch stream

Run `npm run bench:animation-patches -- --output tests/benchmarks/animation-patch-results.json` to repeat the [three-run report](./benchmarks/animation-patch-results.json). Each run advances an actual grass disturbance for 35 consecutive frames; five are warmup. Both codecs observe the same source states. Exact full-frame bytes are checked against both replicas every five frames. Source update and codec times are measured independently, and replay order alternates. Timing is informational, not a test gate.

For default grass, 128,298 instances, Windows x64 and Node v24.22.1:

| Work | Stateless WFD1 median | Stateful patch median |
| --- | ---: | ---: |
| Capture and encode | 10.60–10.90 ms | 2.92–3.20 ms |
| Verify and apply | 11.60–11.73 ms | 1.17–1.23 ms |
| Packet | 509.2 KiB | 646.7 KiB |

The patch format trades more bytes for less work: it compares only attributes marked as changed, copies changed 512-word chunks, and applies those chunks directly. Sender simulation plus patch capture/encoding took 7.97–8.62 ms median; p95 ranged 11.32–13.53 ms and the worst of 90 measured samples was 16.80 ms. Receiver patch replay p95 was 1.66–1.99 ms. The sender and receiver are separate paths and should not automatically be added as one frame's work.

**This does not establish a 60 fps application.** One sender sample exceeded the whole 16.67 ms budget and the test excludes transport, other game work, rendering and GPU uploads. Applying a keyframe, allocating sender snapshots, and acknowledging the stream are also outside steady-state measurements. Keyframes still contain 11,380,500 bytes in this scenario. The patch encoder retains a copy of live buffer data; patches can be larger than WFD1 (646.7 KiB per packet is about 38 MiB/s at 60 packets per second before transport overhead), and a missed buffer revision or a topology/transform change requires a new keyframe. The benchmark does not cover browser or GPU performance.

## Wind-only fast path

Three sequential paired runs used 128,298 default grass instances. The keyframe had already been applied and acknowledged. Each stateless sample captured a full frame and encoded a verified WFD1 delta; each fast-path sample captured an absolute uniform update, checked tracked render state and encoded a verified WUS1 packet. Both advanced shader wind; stream ticks increased for each packet. On receive, the prior path verified, reconstructed and applied the full state, while the stream verified and applied uniforms only. Timings exclude effect update, rendering, transport and keyframe setup.

| Work | Stateless delta median elapsed | Uniform stream median elapsed |
| --- | ---: | ---: |
| Capture and encode | 11.40–13.04 ms | 0.11–0.18 ms |
| Verify and apply | 11.97–12.75 ms | 0.16–0.21 ms |

Uniform packets were 304 bytes; the stateless WFD1 wind packet was 3,328 bytes. Both paths delivered matching uniform state, and the stream caused no instance-matrix, color or geometry-attribute version changes. The fast path's sample p95 ranged from 0.25–0.34 ms for encoding and 0.24–0.30 ms for replay. These are batched CPU-side observations on one Windows x64 / Node v24.22.1 machine, not a 60 fps or GPU guarantee. Process CPU is reported in the JSON; a separate 512-operation batch measured 0.04–0.05 ms per encode and 0.04–0.05 ms per replay, but Windows accounting is coarse and subject to GC and background worker noise.

The fast path applies only while tracked geometry, transforms and buffer versions stay unchanged. The benchmark applies a disturbance and confirms the stream requests a new keyframe. In these runs, rebuilding a stream required an 11,380,500-byte keyframe, 8.70–9.06 ms to create and 9.32–9.92 ms to install, excluding network. Continuous interactive deformation can require frequent rekeys, so use the patch stream above for that workload. The older stateless delta path took 12.23–13.14 ms to capture/encode and 12.11–12.90 ms to replay in these runs (521,596 raw bytes).

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
