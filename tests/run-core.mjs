import './headless-preset-canvas.mjs'
import {build} from './build-tools.mjs'
import {mkdir} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import path from 'node:path'

await mkdir('validation.local', {recursive:true})
const output = path.resolve('validation.local/core-tests.mjs')
await build({entryPoints:['tests/core-suite.ts'],outfile:output,bundle:true,platform:'node',format:'esm',
  external:['three','three/*'],logLevel:'silent'})
const {runCoreChecks} = await import(pathToFileURL(output).href + '?run=' + Date.now())
const results = runCoreChecks()
for (const result of results) console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.name}${result.error ? ': ' + result.error : ''}`)
const failed = results.filter(result => !result.passed).length
console.log(`\n${results.length - failed}/${results.length} core checks passed (deterministic measurement backend).`)
if (failed) process.exitCode = 1
