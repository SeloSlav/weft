import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const revision = process.argv[2] ?? 'HEAD'
await mkdir(path.join(root, 'validation.local'), { recursive: true })
await build({
  entryPoints: ['src/weft/three/index.ts'],
  bundle: true,
  format: 'esm',
  outfile: 'validation.local/baseline.js',
  external: ['three', 'three/*', '@chenglou/pretext'],
  plugins: [{
    name: 'baseline-from-git',
    setup(builder) {
      builder.onLoad({ filter: /\.tsx?$/ }, ({ path: filename }) => {
        const relative = path.relative(root, filename).replaceAll('\\', '/')
        if (!relative.startsWith('src/')) return
        return {
          contents: execFileSync('git', ['show', `${revision}:${relative}`], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }),
          loader: filename.endsWith('.tsx') ? 'tsx' : 'ts',
          resolveDir: path.dirname(filename),
        }
      })
    },
  }],
})
console.log(`Prepared browser baseline from ${revision}. Open /tests/browser.html and run checks.`)
