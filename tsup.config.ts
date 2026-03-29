import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/weft/index.ts',
    'core/index': 'src/weft/core/index.ts',
    'runtime/index': 'src/weft/runtime/index.ts',
    'three/index': 'src/weft/three/index.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2023',
  outDir: 'dist',
  external: ['three', '@chenglou/pretext'],
})
