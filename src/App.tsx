import { lazy, Suspense, useState } from 'react'
import { Landing } from './Landing'

const Demo = lazy(() => import('./Demo').then((module) => ({ default: module.Demo })))
const Docs = lazy(() => import('./Docs').then((module) => ({ default: module.Docs })))
const Editor = lazy(() => import('./Editor').then((module) => ({ default: module.Editor })))
const SceneryDemo = lazy(() => import('./SceneryDemo').then((module) => ({ default: module.SceneryDemo })))

type SitePage = 'home' | 'docs' | 'editor' | 'demo' | 'scenery'

export default function App() {
  const [page, setPage] = useState<SitePage>('home')

  return (
    <div className="site-root">
      <header className="site-nav">
        <div className="site-nav__brand">
          <button type="button" className="site-nav__logo" onClick={() => setPage('home')}>
            Weft
          </button>
        </div>

        <nav className="site-nav__links" aria-label="Site">
          <button
            type="button"
            className={`site-nav__link${page === 'home' ? ' site-nav__link--active' : ''}`}
            onClick={() => setPage('home')}
          >
            Overview
          </button>
          <button
            type="button"
            className={`site-nav__link${page === 'docs' ? ' site-nav__link--active' : ''}`}
            onClick={() => setPage('docs')}
          >
            Docs
          </button>
          <button
            type="button"
            className={`site-nav__link${page === 'editor' ? ' site-nav__link--active' : ''}`}
            onClick={() => setPage('editor')}
          >
            Third person
          </button>
          <button
            type="button"
            className={`site-nav__link${page === 'scenery' ? ' site-nav__link--active' : ''}`}
            onClick={() => setPage('scenery')}
          >
            First person
          </button>
        </nav>

        <div className="site-nav__meta">
          <button
            type="button"
            className="btn btn--primary site-nav__cta"
            onClick={() => setPage('editor')}
          >
            Third person demo
          </button>
          <button
            type="button"
            className="btn btn--accent site-nav__cta"
            onClick={() => setPage('scenery')}
          >
            First person demo
          </button>
        </div>
      </header>

      <main className="site-main">
        <Suspense fallback={<p className="hint" role="status">Loading…</p>}>
          {page === 'home' ? (
            <Landing onEnterEditor={() => setPage('editor')} onEnterScenery={() => setPage('scenery')} />
          ) : page === 'docs' ? (
            <Docs onEnterEditor={() => setPage('editor')} />
          ) : page === 'demo' ? (
            <Demo />
          ) : page === 'scenery' ? (
            <SceneryDemo />
          ) : (
            <Editor />
          )}
        </Suspense>
      </main>
    </div>
  )
}
