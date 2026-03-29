---
name: playground performance pass
overview: Improve the town-edge playground toward a game-ready 60fps target by removing dead per-frame work, lowering effect update cost, and adding scalable rendering-quality controls without abandoning the Weft source -> layout -> effect model.
todos:
  - id: runtime-hotspots
    content: Remove dead or duplicate per-frame work in the playground loop and make updates conditional/dirty-driven.
    status: completed
  - id: preset-cost-cuts
    content: Reduce per-effect CPU/GPU cost in grass, fish/glass, rock, fire, and sky while preserving the current showcase behavior.
    status: completed
  - id: rendering-budget
    content: Lower lighting, transparency, and always-drawn instance overhead; add quality tiers/LOD hooks for shipping-style performance.
    status: completed
  - id: validation
    content: Add lightweight perf instrumentation and verify behavior/visual parity after each optimization stage.
    status: completed
isProject: false
---

# Playground Performance Plan

## Goal

Keep the current intersection showcase and Weft-first authoring model, but make the runtime much closer to a 60fps game budget by cutting unnecessary work first, then reducing effect and rendering cost in the highest-impact places.

## Stage 1: Remove obvious runtime waste

- In [src/playground/PlaygroundRuntime.ts](c:/WebProjects/pretext-three-experiment/src/playground/PlaygroundRuntime.ts), remove or heavily throttle `updateReticleFromCamera()`.
- Right now `frame()` raycasts every tick through many interaction meshes even though the reticle path only ends up calling `setReticleVisible(true)`.
- Reuse mutable controller input/config objects instead of creating fresh `{ ...this.inputState }` and `{ ...PLAYGROUND_CONTROLLER }` objects every frame.
- Audit duplicate effect updates in reset/init and the main loop so each effect updates only when needed.

## Stage 2: Add idle gating and update-rate control

- In [src/playground/PlaygroundRuntime.ts](c:/WebProjects/pretext-three-experiment/src/playground/PlaygroundRuntime.ts), add dirty/active checks so non-interacting effects do not fully update every frame.
- Treat windows, lamps, neon, and sky as lower-priority when they have no active wounds or recent parameter changes.
- Add simple per-effect throttling targets:
  - full-rate for nearby/interactive effects
  - half-rate or on-demand for decorative/idle effects
- Keep the Weft flow intact: same prepared source and layout model, but effect projection runs less often when nothing changed.

## Stage 3: Cut preset CPU hotspots

- In [src/weft/three/presets/grassField.ts](c:/WebProjects/pretext-three-experiment/src/weft/three/presets/grassField.ts), reduce the `O(blades × disturbances)` cost by replacing full disturbance scans with a cheaper approximation or spatial bucketing.
- Add a lower-cost gameplay profile for grass instance density and/or rows/sectors; grass is currently the largest sustained instance workload.
- In [src/weft/three/presets/fishScale.ts](c:/WebProjects/pretext-three-experiment/src/weft/three/presets/fishScale.ts), reduce expensive surface sampling and patch deformation frequency for glass/windows/facades.
- For rock and sky in [src/weft/three/presets/rockField.ts](c:/WebProjects/pretext-three-experiment/src/weft/three/presets/rockField.ts) and [src/weft/three/presets/starSky.ts](c:/WebProjects/pretext-three-experiment/src/weft/three/presets/starSky.ts), cache or simplify repeated per-instance math where the scene is mostly static.
- In [src/weft/three/presets/fireWall.ts](c:/WebProjects/pretext-three-experiment/src/weft/three/presets/fireWall.ts), avoid avoidable per-particle allocations and keep wound checks cheap.

## Stage 4: Lower GPU/rendering cost

- Revisit `frustumCulled = false` in the large preset meshes under [src/weft/three/presets](c:/WebProjects/pretext-three-experiment/src/weft/three/presets); restore culling where safe or replace with coarser visibility/LOD.
- In [src/playground/playgroundEnvironment.ts](c:/WebProjects/pretext-three-experiment/src/playground/playgroundEnvironment.ts) and [src/playground/playgroundTownScene.ts](c:/WebProjects/pretext-three-experiment/src/playground/playgroundTownScene.ts), reduce the light/material budget:
  - simplify static town materials where PBR is not buying much
  - trim point-light/fill-light usage
  - reduce transparent PBR where opaque/emissive or dithered alternatives work
- Keep neon/stars/windows visually similar, but make them cheaper to draw when they are not the focal effect.

## Stage 5: Add shipping-style quality controls

- Add a small quality system in [src/playground/PlaygroundRuntime.ts](c:/WebProjects/pretext-three-experiment/src/playground/PlaygroundRuntime.ts) and [src/Editor.tsx](c:/WebProjects/pretext-three-experiment/src/Editor.tsx): `Low`, `Medium`, `High`.
- Tie quality to practical knobs already present in the presets:
  - grass layout density / instance budget
  - fish/glass update frequency
  - star/fire counts or update cadence
  - renderer DPR cap / optional AA reduction
- This gives a clear path from showcase mode to game mode without changing the SDK usage model.

## Validation

- Add lightweight timing counters around the main effect updates in [src/playground/PlaygroundRuntime.ts](c:/WebProjects/pretext-three-experiment/src/playground/PlaygroundRuntime.ts) so we can compare before/after cost per effect.
- Validate in this order:
  1. remove dead frame work
  2. add idle gating
  3. reduce grass/fish cost
  4. reduce rendering/light cost
- After each step, verify that interaction still behaves the same: wounds heal, lamp outages recover, grass still avoids roads, neon still blocks the intersection, and visuals remain close to the current showcase.

