import {build} from './build-tools.mjs'
import {mkdir,writeFile} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import path from 'node:path'
const args=process.argv.slice(2),position=args.indexOf('--output')
const output=path.resolve(position<0?'validation.local/animation-frame-benchmark.json':args[position+1])
await mkdir('validation.local',{recursive:true})
const bundle=path.resolve('validation.local/animation-frame-benchmark.mjs')
await build({entryPoints:['src/weft/index.ts'],outfile:bundle,bundle:true,platform:'node',format:'esm',external:['three','three/*'],logLevel:'silent'})
console.log('Measuring JSON and binary frame capture, transport size, and replay…')
const child=spawnSync(process.execPath,['--expose-gc','tests/animation-frame-bench-worker.mjs',bundle],{encoding:'utf8',maxBuffer:4*1024*1024})
if(child.status!==0)throw Error((child.stderr||child.error?.message||`Worker exited ${child.status}`).slice(0,4000))
const measured=JSON.parse(child.stdout)
const gates={exactParity:measured.results.every(r=>r.parity),binarySmaller:measured.results.every(r=>r.binaryBytes<r.jsonBytes)}
const report={generatedAt:new Date().toISOString(),environment:{node:measured.node,platform:measured.platform,arch:measured.arch},
  note:'Same current effect state and output; JSON capture+stringify versus binary capture; JSON parse+apply versus binary decode+apply. Alternating paired samples, deterministic canvas metrics; CPU-only, not GPU or network time. Gzip sizes are reported separately, excluding compression CPU cost. Timing ratios are observations, not CI gates.',
  cases:measured.results,gates}
await mkdir(path.dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n')
console.table(measured.results.map(r=>({fixture:r.name,instances:r.instances,jsonKB:(r.jsonBytes/1024).toFixed(1),binaryKB:(r.binaryBytes/1024).toFixed(1),
  saved:((1-r.binaryBytes/r.jsonBytes)*100).toFixed(1)+'%',captureSpeedup:(r.captureAndEncode.json.medianMs/r.captureAndEncode.binary.medianMs).toFixed(2)+'x',
  replaySpeedup:(r.decodeAndApply.json.medianMs/r.decodeAndApply.binary.medianMs).toFixed(2)+'x'})))
console.log('Regression gates:',gates,'Report:',output)
if(Object.values(gates).some(value=>!value))process.exitCode=1
