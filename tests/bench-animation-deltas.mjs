import {build} from './build-tools.mjs'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import path from 'node:path'
const args=process.argv.slice(2),position=args.indexOf('--output')
const output=path.resolve(position<0?'validation.local/animation-delta-benchmark.json':args[position+1])
await mkdir('validation.local',{recursive:true})
const bundle=path.resolve('validation.local/animation-delta-benchmark.mjs')
const baselineSource='tests/fixtures/animationDeltaBaseline.ts'
const baselineBundle=path.resolve('validation.local/animation-delta-baseline.mjs')
await build({entryPoints:['src/weft/index.ts'],outfile:bundle,bundle:true,platform:'node',format:'esm',external:['three','three/*'],logLevel:'silent'})
await build({entryPoints:[baselineSource],outfile:baselineBundle,bundle:true,platform:'node',format:'esm',external:['three','three/*'],logLevel:'silent'})
console.log('Measuring full frames and paired baseline/current verified deltas…')
const child=spawnSync(process.execPath,['--expose-gc','tests/animation-delta-bench-worker.mjs',bundle,baselineBundle],{encoding:'utf8',maxBuffer:4*1024*1024})
if(child.status!==0)throw Error((child.stderr||child.error?.message||`Worker exited ${child.status}`).slice(0,4000))
const measured=JSON.parse(child.stdout)
const gates={exactParity:measured.results.every(r=>r.parity && r.beforeAfter.packetParity),neverLarger:measured.results.every(r=>r.packetBytes<=r.fullBytes),
  windDeltaSmaller:measured.results.find(r=>r.name==='grass-wind-default').packetBytes<measured.results.find(r=>r.name==='grass-wind-default').fullBytes}
const report={generatedAt:new Date().toISOString(),environment:{node:measured.node,platform:measured.platform,arch:measured.arch},
  baseline:{source:baselineSource,sha256:createHash('sha256').update(await readFile(baselineSource)).digest('hex')},
  note:'Same effect and inputs: full capture/apply versus current deltas, plus paired previous/current delta implementations. Alternating paired batched samples report elapsed time and process CPU (user+system), including Web Crypto worker CPU. Deterministic canvas metrics; excludes GPU and network. Gzip sizes exclude compression CPU. Timing is informational; gates check byte/state parity and size.',cases:measured.results,gates}
await mkdir(path.dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n')
console.table(measured.results.map(r=>({fixture:r.name,instances:r.instances,fullKB:(r.fullBytes/1024).toFixed(1),deltaKB:(r.packetBytes/1024).toFixed(1),
  saved:((1-r.packetBytes/r.fullBytes)*100).toFixed(2)+'%',kind:r.packetKind,
  encodeBefore:r.beforeAfter.captureAndEncode.before.medianMs.toFixed(2),encodeAfter:r.beforeAfter.captureAndEncode.after.medianMs.toFixed(2),
  replayBefore:r.beforeAfter.decodeAndApply.before.medianMs.toFixed(2),replayAfter:r.beforeAfter.decodeAndApply.after.medianMs.toFixed(2)})))
console.log('Mean process CPU per operation (user + system; coarse timer resolution may produce zeros):')
console.table(measured.results.map(r=>({fixture:r.name,encodeCpuBefore:r.beforeAfter.captureAndEncode.before.cpuMeanMs.toFixed(2),
  encodeCpuAfter:r.beforeAfter.captureAndEncode.after.cpuMeanMs.toFixed(2),replayCpuBefore:r.beforeAfter.decodeAndApply.before.cpuMeanMs.toFixed(2),
  replayCpuAfter:r.beforeAfter.decodeAndApply.after.cpuMeanMs.toFixed(2)})))
console.log('Regression gates:',gates,'Report:',output)
if(Object.values(gates).some(value=>!value))process.exitCode=1
