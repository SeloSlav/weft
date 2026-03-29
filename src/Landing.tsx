type LandingProps = {
  onEnterEditor: () => void
}

export function Landing({ onEnterEditor }: LandingProps) {
  return (
    <div className="landing">
      <div className="landing__inner">
        <p className="landing__eyebrow">Layout engine · Three.js playground</p>
        <h1 className="landing__title">
          Typesetting on <span className="landing__title-accent">geometry</span>
        </h1>
        <p className="landing__lead">
          In 3D, decoration is usually scatter, noise, or baked textures: it looks fine, but it is not
          line-by-line layout. Pretext Weft treats bands and paths on a mesh like lines with changing
          width: you measure a stream once, then reflow when the surface bends, cuts, or obstacles move.
          This playground is the reference build: batched Pretext measurement, a fast numeric layout pass,
          and samples you can drive in the browser.
        </p>

        <div className="landing__actions">
          <button type="button" className="btn btn--primary" onClick={onEnterEditor}>
            Open playground
          </button>
        </div>

        <ul className="landing__features" aria-label="What you get">
          <li>
            <strong>Prepare &amp; measure</strong>
            <span>Pretext-backed streams with cached segment widths for reflow without per-frame DOM work.</span>
          </li>
          <li>
            <strong>Surface-aware layout</strong>
            <span>Walk bands with a layout cursor; variable sector width models wounds, vents, and obstacles.</span>
          </li>
          <li>
            <strong>WebGPU rendering</strong>
            <span>
              The scene uses Three.js <code>WebGPURenderer</code> so instancing and shading run on the modern
              graphics API your browser exposes for compute-friendly, efficient GPU work.
            </span>
          </li>
        </ul>
      </div>
    </div>
  )
}
