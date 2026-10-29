# Animation delta benchmark

Run `npm run bench:animation-deltas` to compare complete binary frames and verified deltas, including a paired comparison with the pre-optimization implementation. Pass `-- --output <path>` to save the report elsewhere. The [full sample](./benchmarks/animation-delta-results.json) contains raw measurements and the [three-run comparison](./benchmarks/animation-delta-cpu-results.json) records independent sequential runs.

The benchmark captures consecutive simulation states at 0.05 and 0.10 seconds with the indicated interaction. The delta path includes full frame capture, change detection and two SHA-256 digests; replay includes verification, reconstruction and application. Each case uses two warmup samples and seven alternating paired samples, batched by workload. It records per-operation elapsed time and process CPU time (user plus system, including Web Crypto worker threads); CPU mean and median are calculated from the batches. The frozen [baseline fixture](./fixtures/animationDeltaBaseline.ts) has SHA-256 `be2e99abe58376f797b24cea28b7341f7c1e11001de8683041bb11a8c05ee023` and uses the current binary capture and application code, so the comparison isolates the delta codec. Both implementations emit byte-for-byte identical packets. Deterministic font metrics are used; measurements exclude compression, network transfer and GPU work.

The Windows x64 / Node v24.22.1 sample measured the following median elapsed times:

| Effect | Full bytes | Delta bytes | Encode before → after (ms) | Replay before → after (ms) |
| --- | ---: | ---: | ---: | ---: |
| Fungus, active | 7,424 | 1,440 | 0.177 → 0.156 | 0.212 → 0.117 |
| Grass, default, wind only | 11,380,500 | 3,328 | 27.625 → 12.807 | 19.296 → 12.236 |
| Grass, low, active disturbance | 1,957,276 | 90,532 | 5.038 → 3.059 | 4.156 → 2.783 |
| Leaf pile, active | 66,484 | 1,336 | 0.320 → 0.218 | 0.269 → 0.175 |
| Shutter shell, active | 190,332 | 45,768 | 0.630 → 0.398 | 0.593 → 0.371 |
| Fire, active | 183,500 | 162,872 | 1.047 → 0.812 | 0.821 → 0.602 |
| Fungus, full-change fallback | 7,424 | 7,424 | 0.086 → 0.078 | 0.026 → 0.021 |

Across three independent runs, the default wind-only grass case encoded in 20.8–27.6 ms before and 10.3–12.8 ms after; replay took 17.4–19.3 ms before and 10.7–12.2 ms after. Mean process CPU per operation ranged from 46.9–54.4 ms before and 31.3–46.1 ms after for encoding, and 51.9–65.8 ms before and 33.8–42.2 ms after for replay. Process CPU can exceed elapsed time because hashing and garbage collection use multiple threads. The Windows CPU timer is coarse and small cases often report zero; these CPU numbers are noisy and should not be treated as exact per-call costs. Timings vary with hardware, JIT, GC and system load.

The optimized codec overlaps hashing with sparse change detection, specializes aligned word comparisons and reconstructs before awaiting two concurrent hash checks. It preserves the same packet format and verifies both hashes before applying state. The smaller payload still costs more elapsed time than a full frame: in the final sample, default grass full capture was 2.211 ms and full replay was 0.804 ms, compared with 13.148 ms and 12.632 ms for the delta in the separately sampled full-vs-delta comparison.

The wind-only packet was about 99.97% smaller; fire changed most particle matrices and saved only 11% raw. The encoder returns a full keyframe when a delta would not be smaller. It does not predict gzip size: for fire, gzip produced 64,934 bytes for the full frame and 76,174 bytes for the delta.

Gates require exact reconstructed bytes and applied state, identical baseline/current packets, no larger packet than a full frame, and a smaller wind-only packet. Timing is informational. `npm test` also checks wrong or missing baselines, corruption, output limits, keyframe fallback, changing populations, tick rollover, input mutation during async verification, Node Buffer ownership, unaligned buffers, 50 randomized transitions against the frozen baseline, and separate-process replay with different simulated font metrics. No browser or GPU claim is based on this CPU benchmark.
