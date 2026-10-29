# Animation frame benchmark

Run `npm run bench:animation-frames` to measure the current JSON and binary
formats against the same authored effect states. Pass `-- --output <path>` to
save the report elsewhere. The recorded sample is
[`benchmarks/animation-frame-results.json`](./benchmarks/animation-frame-results.json).

The benchmark constructs each effect with seed 17 and deterministic test canvas
metrics, applies an interaction, and captures its active state. For each format it
runs three warmups and nine alternating paired samples. It measures complete JSON
capture plus `JSON.stringify` against binary capture, and JSON parse plus apply
against binary decode plus apply. Median and p95 timings are in the report. It
also checks that binary replay produces the same frame as JSON replay and that
binary payloads are smaller. The benchmark does not measure network transfer,
compression time, native browser fonts, GPU upload execution, or rendering.

The Windows x64 / Node 24 sample measured the following medians and raw sizes.
KiB means 1,024 bytes; timing ratios vary with the machine, JIT and GC.

| Effect | Instances | JSON KiB | Binary KiB | Capture JSON → binary (ms) | Replay JSON → binary (ms) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Fungus | 58 | 14.3 | 7.3 | 0.122 → 0.055 | 0.105 → 0.050 |
| Grass, low | 21,216 | 4,429.1 | 1,911.4 | 33.089 → 0.676 | 17.059 → 0.320 |
| Grass, medium | 63,420 | 12,868.6 | 5,538.3 | 148.354 → 1.697 | 73.110 → 0.924 |
| Grass, default | 128,298 | 25,842.5 | 11,113.8 | 246.475 → 2.859 | 114.513 → 1.162 |
| Leaf pile | 809 | 147.5 | 64.9 | 1.533 → 0.103 | 0.611 → 0.039 |
| Shutter shell | 396 | 487.2 | 185.9 | 3.617 → 0.244 | 3.058 → 0.226 |

Raw binary frames were 49–62% smaller in these fixtures. With gzip applied to
both formats, the default grass sample was 10,335,788 bytes for JSON and
8,560,386 bytes for binary; the report contains gzip sizes for every case.
Compression CPU cost is not included in the timings. Full binary frames are
still large for dense scenes. The separate [delta benchmark](./ANIMATION-DELTAS.md)
measures ordered delta packets against these full frames.

The binary path writes 32-bit words directly rather than expanding them into
JSON decimal numbers and validating each decoded number. It still validates the
schema and buffer lengths, preserves IEEE bit patterns, and emits a self-contained
frame. Tests cover JSON/binary parity, unaligned buffers, corrupt and truncated
frames, and replay in separate processes with different simulated font metrics.
`npm test` runs those checks. Timing is informational; the benchmark gates only
exact replay parity and smaller raw payloads.
