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
          Pretext Weft packs measured visual units along bands and paths on 3D surfaces—like line layout,
          except the “lines” follow contours, obstacles, and deformation. This site is the reference
          implementation: batched measurement, a hot arithmetic layout path, and live samples you can steer.
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
            <strong>WebGPU only</strong>
            <span>
              The playground renders with Three.js <code>WebGPURenderer</code>—no WebGL backend or silent fallback.
              Use a WebGPU-capable browser.
            </span>
          </li>
        </ul>
      </div>
    </div>
  )
}
