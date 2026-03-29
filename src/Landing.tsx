type LandingProps = {
  onEnterEditor: () => void
}

export function Landing({ onEnterEditor }: LandingProps) {
  return (
    <div className="landing">
      <div className="landing__inner">
        <p className="landing__eyebrow">Surface layout engine</p>
        <h1 className="landing__title">
          Typography as a{' '}
          <span className="landing__title-accent">3D placement engine</span>
        </h1>
        <p className="landing__lead">
          Traditional scatter fills a surface with random or noise-driven points, then places instances at
          those points. Density, spacing, and variation are all hand-tuned constants with no semantic
          meaning. Making them respond to gameplay requires a separate system entirely.
        </p>
        <p className="landing__lead">
          This engine runs a{' '}
          <strong style={{ color: '#c8d6e8' }}>typographic line-breaking algorithm</strong> across a grid
          of world slots. Start with a simple glyph array, or drop down to an explicit semantic palette
          when you need stable ids, weights, or metadata. Pretext measures the resolved glyph stream and
          breaks lines to fit each slot's width. Density emerges from font metrics, not magic numbers.
        </p>

        <div className="landing__actions">
          <button type="button" className="btn btn--primary" onClick={onEnterEditor}>
            Open engine playground
          </button>
        </div>

        <div className="landing__compare">
          <div className="landing__compare-col">
            <p className="landing__compare-label landing__compare-label--bad">Traditional scatter</p>
            <ul className="landing__compare-list">
              <li>Random or blue-noise point distribution</li>
              <li>Density is a hand-tuned constant</li>
              <li>Responding to gameplay needs a separate system (damage texture, compute pass, CPU rebuild)</li>
              <li>Every effect reinvents its own packing logic</li>
              <li>Variation comes from RNG seeded per-instance</li>
            </ul>
          </div>
          <div className="landing__compare-col">
            <p className="landing__compare-label landing__compare-label--good">This engine</p>
            <ul className="landing__compare-list">
              <li>Line-breaking over a rows × sectors world grid</li>
              <li>Density emerges from font metrics and slot width</li>
              <li>Gameplay narrows a slot width and the layout engine handles the rest</li>
              <li>One control can swap a field between healthy, dry, corrupted, and dead states with the same projection code</li>
              <li>Every surface type shares the same driver and API</li>
              <li>Variation is token-seeded and deterministic per row band</li>
            </ul>
          </div>
        </div>

        <h2 className="landing__section-title">How quickly can you add a new surface</h2>
        <p className="landing__lead">
          A new surface type needs two things. A glyph vocabulary and a projection. That's it.
        </p>

        <div className="landing__code-block">
          <p className="landing__code-label">Step 1. Define your surface source (~10 lines)</p>
          <pre className="landing__pre">{`const shellUnits = ['◓', '◒', '◐', '◑', '◉', '◍', '◎'] as const

export function getPreparedMySurface() {
  return prepareSurfaceText(
    'my-surface',
    shellUnits,
    22,
    SURFACE_TEXT_FONT,
  )
}`}</pre>
        </div>

        <p className="landing__lead">
          Need more control? The same API also accepts explicit entries like
          <code className="landing__code-inline">{` { id, glyph, weight, meta } `}</code>
          and normalizes both forms into the same semantic pipeline.
        </p>

        <div className="landing__code-block">
          <p className="landing__code-label">Step 2. Drive layout and place instances (~80–120 lines)</p>
          <pre className="landing__pre">{`this.driver = new SurfaceLayoutDriver({
  surface, rows: 20, sectors: 12,
  advanceForRow: (row) => row * 13 + 5,
  seedCursor,
})

this.driver.forEachLaidOutLine({
  spanMin: -5, spanMax: 5,
  lineCoordAtRow: (row) => startZ - row * rowStep,
  getMaxWidth: (slot) => slot.spanSize * LAYOUT_PX_PER_WORLD,
  onLine: ({ slot, resolvedGlyphs }) => {
    // set InstancedMesh matrices from slot + resolvedGlyphs
  },
})`}</pre>
        </div>

        <p className="landing__lead">
          That's the entire API. Forget spatial indexing, noise functions, and custom packing loops.
          Line-breaking, row seeding, stagger, slot clipping, and palette normalization are all handled
          by the driver stack.
        </p>

        <h2 className="landing__section-title">The real payoff is gameplay-driven density</h2>
        <p className="landing__lead">
          The <code className="landing__code-inline">getMaxWidth</code> callback receives the current slot
          on every frame. Return a smaller number and fewer glyphs fit, so the surface visibly thins out.
          Return zero and the slot is empty. Some surfaces use that directly, while others keep layout
          stable while swapping semantic source weights to move the exact same terrain between visibly
          different world states, with no separate damage texture or compute pass.
        </p>

        <div className="landing__code-block">
          <pre className="landing__pre">{`getMaxWidth: (slot) => {
  const damage = this.getDamageAt(slot.spanCenter, slot.lineCoord)
  return slot.spanSize * LAYOUT_PX_PER_WORLD * (1 - damage)
},`}</pre>
        </div>

        <p className="landing__lead">
          In a traditional scatter pipeline, making density respond to gameplay is a non-trivial
          engineering task. Here the same surface can also become healthy, dry, corrupted, or dead just
          by changing the semantic source and re-running layout through the same projection callback.
        </p>

        <ul className="landing__features" aria-label="Engine properties">
          <li>
            <strong>One driver, every surface type</strong>
            <span>
              Grass, fish scales, rock fields, fire, sky, coral, ornament. All share{' '}
              <code>SurfaceLayoutDriver</code> and <code>forEachLaidOutLine</code>. You only write the
              glyph source and the per-token matrix placement.
            </span>
          </li>
          <li>
            <strong>Deterministic, not random</strong>
            <span>
              Each row gets a band seed derived from its index via <code>advanceForRow</code>. The same
              world state always produces the same layout. No RNG drift between frames.
            </span>
          </li>
          <li>
            <strong>Plain TypeScript and Three.js WebGPU</strong>
            <span>
              No React Three Fiber in the render path. The core ideas are portable to tools, editors,
              and non-React game runtimes.
            </span>
          </li>
        </ul>
      </div>
    </div>
  )
}
