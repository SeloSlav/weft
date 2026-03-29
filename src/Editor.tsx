import { useEffect, useRef, useState, type ReactNode } from "react";
import { PlaygroundRuntime } from "./playground/PlaygroundRuntime";
import {
  DEFAULT_FISH_SCALE_PARAMS,
  DEFAULT_GRASS_FIELD_PARAMS,
} from "./playground/types";

type ControlSectionProps = {
  title: string;
  summary?: string;
  children: ReactNode;
};

function ControlSection({ title, summary, children }: ControlSectionProps) {
  return (
    <details className="control-section" open>
      <summary className="control-section__summary">
        <span>{title}</span>
        {summary && <small>{summary}</small>}
      </summary>
      <div className="control-section__body">{children}</div>
    </details>
  );
}

export function Editor() {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<PlaygroundRuntime | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [runtimeState, setRuntimeState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  const [woundRadius, setWoundRadius] = useState(
    DEFAULT_FISH_SCALE_PARAMS.woundRadius,
  );
  const [woundNarrow, setWoundNarrow] = useState(
    DEFAULT_FISH_SCALE_PARAMS.woundNarrow,
  );
  const [woundDepth, setWoundDepth] = useState(
    DEFAULT_FISH_SCALE_PARAMS.woundDepth,
  );
  const [scaleLift, setScaleLift] = useState(
    DEFAULT_FISH_SCALE_PARAMS.scaleLift,
  );
  const [surfaceFlex, setSurfaceFlex] = useState(
    DEFAULT_FISH_SCALE_PARAMS.surfaceFlex,
  );
  const [fishRecoveryRate, setFishRecoveryRate] = useState(
    DEFAULT_FISH_SCALE_PARAMS.recoveryRate,
  );
  const [disturbanceRadius, setDisturbanceRadius] = useState(
    DEFAULT_GRASS_FIELD_PARAMS.disturbanceRadius,
  );
  const [disturbanceStrength, setDisturbanceStrength] = useState(
    DEFAULT_GRASS_FIELD_PARAMS.disturbanceStrength,
  );
  const [trampleDepth, setTrampleDepth] = useState(
    DEFAULT_GRASS_FIELD_PARAMS.trampleDepth,
  );
  const [wind, setWind] = useState(DEFAULT_GRASS_FIELD_PARAMS.wind);
  const [recoveryRate, setRecoveryRate] = useState(
    DEFAULT_GRASS_FIELD_PARAMS.recoveryRate,
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const runtime = new PlaygroundRuntime(host);
    runtimeRef.current = runtime;

    let cancelled = false;

    runtime
      .initialize()
      .then(() => {
        if (cancelled) return;
        setRuntimeState("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setRuntimeState("error");
        setRuntimeError(
          error instanceof Error
            ? error.message
            : "Failed to initialize WebGPU renderer.",
        );
      });

    return () => {
      cancelled = true;
      runtimeRef.current = null;
      runtime.dispose();
    };
  }, []);

  useEffect(() => {
    runtimeRef.current?.setFishScaleParams({
      woundRadius,
      woundNarrow,
      woundDepth,
      scaleLift,
      surfaceFlex,
      recoveryRate: fishRecoveryRate,
    });
  }, [
    fishRecoveryRate,
    scaleLift,
    surfaceFlex,
    woundDepth,
    woundNarrow,
    woundRadius,
  ]);

  useEffect(() => {
    runtimeRef.current?.setGrassFieldParams({
      disturbanceRadius,
      disturbanceStrength,
      trampleDepth,
      wind,
      recoveryRate,
    });
  }, [
    disturbanceRadius,
    disturbanceStrength,
    recoveryRate,
    trampleDepth,
    wind,
  ]);

  return (
    <div className="app-shell">
      <aside
        className={sidebarCollapsed ? "sidebar sidebar--collapsed" : "sidebar"}
      >
        {sidebarCollapsed ? (
          <button
            type="button"
            className="sidebar-expand"
            onClick={() => setSidebarCollapsed(false)}
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
            <span aria-hidden>›</span>
          </button>
        ) : (
          <>
            <header className="sidebar-header">
              <div className="sidebar-header__row">
                <h1>Playground</h1>
                <button
                  type="button"
                  className="sidebar-collapse"
                  onClick={() => setSidebarCollapsed(true)}
                  aria-label="Collapse sidebar"
                  title="Collapse sidebar"
                >
                  <span aria-hidden>‹</span>
                </button>
              </div>
              <p className="tagline">
                Pretext Weft uses Pretext for measurement and deterministic
                layout on changing width fields, rendered in TypeScript with
                Three.js WebGPU.
              </p>
            </header>

            <section className="sample-detail">
              <div className="sample-controls">
                <ControlSection
                  title="Grass Controls"
                  summary="Ground response"
                >
                  <label className="control">
                    <span>
                      Disturbance radius ({disturbanceRadius.toFixed(2)} world
                      units)
                    </span>
                    <input
                      type="range"
                      min={0.5}
                      max={2.4}
                      step={0.02}
                      value={disturbanceRadius}
                      onChange={(e) =>
                        setDisturbanceRadius(Number(e.target.value))
                      }
                    />
                  </label>
                  <label className="control">
                    <span>
                      Field compression ({Math.round(disturbanceStrength * 100)}
                      %)
                    </span>
                    <input
                      type="range"
                      min={0.2}
                      max={0.95}
                      step={0.02}
                      value={disturbanceStrength}
                      onChange={(e) =>
                        setDisturbanceStrength(Number(e.target.value))
                      }
                    />
                  </label>
                  <label className="control">
                    <span>Trample depth</span>
                    <input
                      type="range"
                      min={0.12}
                      max={1.25}
                      step={0.02}
                      value={trampleDepth}
                      onChange={(e) => setTrampleDepth(Number(e.target.value))}
                    />
                  </label>
                  <label className="control">
                    <span>Wind intensity</span>
                    <input
                      type="range"
                      min={0}
                      max={1.4}
                      step={0.02}
                      value={wind}
                      onChange={(e) => setWind(Number(e.target.value))}
                    />
                  </label>
                  <label className="control">
                    <span>Recovery rate</span>
                    <input
                      type="range"
                      min={0.02}
                      max={0.8}
                      step={0.02}
                      value={recoveryRate}
                      onChange={(e) => setRecoveryRate(Number(e.target.value))}
                    />
                  </label>
                </ControlSection>

                <ControlSection
                  title="Fish Surface Controls"
                  summary="Wall wounds"
                >
                  <label className="control">
                    <span>
                      Wound radius ({woundRadius.toFixed(2)} world units)
                    </span>
                    <input
                      type="range"
                      min={0.3}
                      max={1.1}
                      step={0.02}
                      value={woundRadius}
                      onChange={(e) => setWoundRadius(Number(e.target.value))}
                    />
                  </label>
                  <label className="control">
                    <span>
                      Width retained inside wound (
                      {Math.round(woundNarrow * 100)}%)
                    </span>
                    <input
                      type="range"
                      min={0.08}
                      max={0.75}
                      step={0.02}
                      value={woundNarrow}
                      onChange={(e) => setWoundNarrow(Number(e.target.value))}
                    />
                  </label>
                  <label className="control">
                    <span>Crater depth</span>
                    <input
                      type="range"
                      min={0.15}
                      max={1.1}
                      step={0.02}
                      value={woundDepth}
                      onChange={(e) => setWoundDepth(Number(e.target.value))}
                    />
                  </label>
                  <label className="control">
                    <span>Scale peel</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.02}
                      value={scaleLift}
                      onChange={(e) => setScaleLift(Number(e.target.value))}
                    />
                  </label>
                  <label className="control">
                    <span>Idle surface flex</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.02}
                      value={surfaceFlex}
                      onChange={(e) => setSurfaceFlex(Number(e.target.value))}
                    />
                  </label>
                  <label className="control">
                    <span>Recovery rate</span>
                    <input
                      type="range"
                      min={0.02}
                      max={0.8}
                      step={0.02}
                      value={fishRecoveryRate}
                      onChange={(e) =>
                        setFishRecoveryRate(Number(e.target.value))
                      }
                    />
                  </label>
                </ControlSection>

                <ControlSection title="Scene Actions" summary="Reset effects">
                  <div className="control-actions">
                    <button
                      type="button"
                      className="btn btn--secondary"
                      onClick={() =>
                        runtimeRef.current?.clearGrassDisturbances()
                      }
                    >
                      Clear grass
                    </button>
                    <button
                      type="button"
                      className="btn btn--secondary"
                      onClick={() => runtimeRef.current?.clearFishWounds()}
                    >
                      Clear fish wall
                    </button>
                    <button
                      type="button"
                      className="btn btn--secondary"
                      onClick={() => runtimeRef.current?.clearAllEffects()}
                    >
                      Clear all
                    </button>
                  </div>
                </ControlSection>
              </div>
            </section>
          </>
        )}
      </aside>

      <main className="viewport">
        <div ref={hostRef} className="viewport-host" />
        {runtimeState === "ready" && (
          <div className="viewport-hint" role="note">
            WASD move. RMB steers, wheel zooms, and LMB shoots into the grass or
            fish wall depending on the reticle.
          </div>
        )}
        {runtimeState !== "ready" && (
          <div className="viewport-status" role="status">
            <strong>
              {runtimeState === "loading"
                ? "Starting WebGPU runtime..."
                : "WebGPU unavailable"}
            </strong>
            <span>
              {runtimeState === "loading"
                ? "This playground runs on a plain TypeScript + Three.js WebGPU runtime."
                : (runtimeError ??
                  "This playground requires a WebGPU-capable browser and adapter.")}
            </span>
          </div>
        )}
      </main>
    </div>
  );
}
