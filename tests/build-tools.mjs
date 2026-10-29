import {createRequire} from 'node:module'

// Resolve the build tool through tsup, which declares it. This also works with strict pnpm layouts.
const requireFromTsup=createRequire(import.meta.resolve('tsup'))
export const build=requireFromTsup('esbuild').build
