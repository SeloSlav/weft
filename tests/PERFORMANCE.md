# Performance and preset validation

Measured locally on October 29, 2026, with Three.js r183 in Chromium. These are
CPU update timings, not GPU timestamps or promises about whole-scene FPS.

| Workload | Before median / p95 | After median / p95 |
| --- | --- | --- |
| Stationary grass with wind | 27.4 / 32.1 ms | below timer resolution / 0.1 ms |
| Grass with a persistent disturbance | 27.2 / 29.7 ms | 5.1 / 7.2 ms |
| Leaf triangles per tree crown | 11,760 | 2,520 |

The grass comparison uses identical explicit density (`8`), wind (`0.58`),
camera (`0, 2, 0`), and culling radius (`20`). Each case has five warm-up updates
and 40 measured updates. Timing includes CPU reactions, matrices, colors and
marking upload ranges; it excludes initial placement and actual GPU execution.
Results vary with hardware, JIT, thermal state and other running tabs.

After the camera-cache fix, this case includes 90,437 authored blades versus
60,528 before. Disturbed blades now retain collapsed slots rather than compacting
all survivors, so instance count includes hidden blades. CPU work follows the
reaction footprint; fully hidden blades still incur vertex work. No density or
viewport reduction was used to obtain the CPU comparison.

The grass blade itself uses 8 triangles instead of 12. Crown geometry retains
folded leaf silhouettes and varied branch elevations with approximately 79% fewer
leaf triangles. Tree/shrub geometry is generated lazily, each effect owns its
burn attributes, and instance buffers are disposed with the effect. Rest matrices
trade approximately 64 CPU bytes per authored grass blade for faster camera and
reaction updates (maximum 17.1 MiB at the 280,000-blade capacity). Layout caches
are bounded to 2,048 exact cursor/width entries and 512 decoded lines per driver.

## Reproduce

1. Run `npm run validate:baseline -- <old-commit>` to create an ignored browser
   baseline in `validation.local/`. Before committing these changes, the default
   `HEAD` is the original implementation. After committing, pass its parent or
   the desired older commit explicitly. Installed dependencies are shared.
2. Run `npm run dev` and open `/tests/browser.html` on that server.
3. Click **Run checks & benchmark**. Without a baseline, regression checks still
   run and the comparison reports that it is unavailable.
4. Run `npm run validate:types` and `npm run build` for source, declarations and
   production builds.

The browser checks cover exact-width Unicode layout, cursor rewind and callback
isolation; pending upload ranges and their retirement after a real WebGPU draw;
WebGL grass shader compilation; idle uploads; deterministic camera round trips;
damage, clearing, dimensions and zero density; high-density coverage at both ends
of the field; natural burn/disturbance recovery; independent canopy burn buffers;
and sparse preset populations.

## Visual contract

The three looks should read without post-processing: green tufts and broad crowns
for Open meadow; layered vegetation and warm stone for Fern glade; copper foliage
and shorter golden cover for Amber woodland. Roots stay grounded under wind,
damage stays local, cleared/recovered reactions restore the rest pose, and camera
movement reveals the same authored field. Higher density is budgeted across the
whole field instead of exhausting capacity on its first rows.

The validation page fixes DPR to 1 and viewport to 960 × 540. Design, near and far
camera bookmarks; time pause/reset; field seeds 17, 71 and 1337; wireframe; vertex
colors; and live triangle/draw counts are available. It uses direct scene rendering
with no offscreen post-processing targets. The first-person demo defaults to direct
rendering and retains its optional toon treatment.

GPU timestamps and device-wide memory were not measured. First placement still
visits the full authored field, and camera transitions between bucket sets still
copy the visible matrix prefix. Extremely dense scenes and many simultaneous
reactions require application-specific budgets.

Demo pages are also loaded on demand. The production entry JavaScript fell from
approximately 1,532 KB (428 KB gzip) to 207 KB (65 KB gzip). Three.js/WebGPU is
still a large shared chunk, downloaded when a demo is opened.
