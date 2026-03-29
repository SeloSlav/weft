import { useEffect, useRef, useState } from 'react'
import { DemoRuntime } from './demo/DemoRuntime'

export function Demo() {
  const hostRef = useRef<HTMLDivElement>(null)
  const runtimeRef = useRef<DemoRuntime | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [showHint, setShowHint] = useState(true)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const runtime = new DemoRuntime(host)
    runtimeRef.current = runtime

    let cancelled = false

    runtime
      .initialize()
      .then(() => {
        if (!cancelled) setState('ready')
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState('error')
          setError(err instanceof Error ? err.message : 'Failed to initialize WebGPU.')
        }
      })

    return () => {
      cancelled = true
      runtimeRef.current = null
      runtime.dispose()
    }
  }, [])

  useEffect(() => {
    if (!showHint) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowHint(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showHint])

  return (
    <div className="demo-shell">
      <div ref={hostRef} className="demo-viewport-host" />
      {showHint && (
        <div className="demo-hint" role="region" aria-label="Demo instructions">
          <div className="demo-hint__header">
            <strong>Demo</strong>
            <button
              type="button"
              className="demo-hint__close"
              onClick={() => setShowHint(false)}
              aria-label="Close demo instructions"
            >
              ×
            </button>
          </div>
          <span>
            Fly through the ring of floating text (Moby-Dick, Chapter 1). Large glyphs wrap in 3D as you pass through.
          </span>
          <ul className="demo-hint__keys">
            <li>
              <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> move
            </li>
            <li>
              <kbd>Space</kbd> up · <kbd>Ctrl</kbd> down
            </li>
            <li>
              <kbd>Shift</kbd> sprint · <kbd>RMB</kbd> drag look · <kbd>Wheel</kbd> zoom (same range as Playground)
            </li>
          </ul>
        </div>
      )}
      {state !== 'ready' && (
        <div className="demo-status" role="status">
          <strong>{state === 'loading' ? 'Starting demo…' : 'WebGPU unavailable'}</strong>
          <span>
            {state === 'loading'
              ? 'Loading the book scene.'
              : (error ?? 'This demo needs a WebGPU-capable browser.')}
          </span>
        </div>
      )}
    </div>
  )
}
