import {build} from './build-tools.mjs'
import {execFileSync,spawnSync} from 'node:child_process'
import {mkdir,writeFile} from 'node:fs/promises'
import path from 'node:path'

const root=process.cwd()
const args=process.argv.slice(2)
const readOption=(flag,fallback)=>{const at=args.indexOf(flag);return at<0 ? fallback : args[at+1]}
// Pinned to the reviewed implementation, so committing the fixes does not silently change the baseline.
const revision=readOption('--baseline','27dad3cc9cafbaecdff3f36140261e2e3a0ff562')
const output=path.resolve(readOption('--output','validation.local/core-benchmark.json'))
await mkdir('validation.local',{recursive:true})
async function bundle(label,ref) {
  const outfile=path.resolve(`validation.local/bench-${label}.mjs`)
  await build({entryPoints:['src/weft/index.ts'],outfile,bundle:true,platform:'node',format:'esm',
    external:['three','three/*'],logLevel:'silent',plugins:ref ? [{name:'git-baseline',setup(builder){
      builder.onLoad({filter:/\.tsx?$/},({path:filename})=>{
        const relative=path.relative(root,filename).replaceAll('\\','/')
        if(!relative.startsWith('src/')) return
        return {contents:execFileSync('git',['show',`${ref}:${relative}`],{encoding:'utf8',maxBuffer:8*1024*1024}),
          loader:filename.endsWith('.tsx')?'tsx':'ts',resolveDir:path.dirname(filename)}
      })
    }}] : []})
  return outfile
}
const baseline=await bundle('before',revision)
const current=await bundle('after')
function run(file) {
  const child=spawnSync(process.execPath,['--expose-gc','tests/core-bench-worker.mjs',file],{encoding:'utf8',maxBuffer:16*1024*1024})
  if(child.status!==0) throw new Error(child.stderr || child.stdout || 'Benchmark worker failed')
  return JSON.parse(child.stdout.trim())
}
console.log(`Benchmarking baseline ${revision} and working tree in isolated processes…`)
const before=run(baseline)
const after=run(current)
const comparisons=[]
for(let i=0;i<after.seeding.length;i++) comparisons.push({case:`${after.seeding[i].fixture} seed ${after.seeding[i].rows} rows`,
  beforeMs:before.seeding[i].medianMs,afterMs:after.seeding[i].medianMs,
  speedup:before.seeding[i].medianMs/Math.max(after.seeding[i].medianMs,1e-9)})
for(const name of ['traversal','sampling']) comparisons.push({case:name,beforeMs:before[name].medianMs,afterMs:after[name].medianMs,
  speedup:before[name].medianMs/Math.max(after[name].medianMs,1e-9)})
console.table(comparisons.map(r=>({case:r.case,beforeMs:r.beforeMs.toFixed(3),afterMs:r.afterMs.toFixed(3),speedup:`${r.speedup.toFixed(1)}x`})))
console.log(`Retained requested sources after GC: ${before.cache.retainedRequestedSources} → ${after.cache.retainedRequestedSources}`)
console.log(`Idle shared runtime: ${after.execution.idle.projectedInstances} projected instances, ${after.execution.idle.bufferWrites} buffer writes`)
console.log(`Dirty row/full invalidation: ${after.execution.dirtyRow.medianMs.toFixed(3)} / ${after.execution.fullInvalidation.medianMs.toFixed(3)} ms`)
const gates={boundedCaches:after.cache.stats.sources.entries<=128 && after.cache.stats.text.entries<=128,
  warmLayoutNoLineBreaking:after.traversal.stats.lineLayouts===0,
  idleNoProjectionOrUpload:after.execution.idle.projectedInstances===0 && after.execution.idle.bufferWrites===0,
  dirtyRowProportional:after.execution.dirtyRow.projectedInstancesPerUpdate<=after.execution.fullInvalidation.projectedInstancesPerUpdate/32,
  seedWorkBounded:after.seeding.every(row=>row.layoutSteps<=13*(row.rows-1)+5+row.rows*32+1)}
const report={baselineRevision:revision,generatedAt:new Date().toISOString(),before,after,comparisons,gates,
  note:'CPU-only core benchmarks using deterministic test metrics, not native browser fonts or GPU timings. Timing ratios are observations; deterministic work/memory gates determine pass/fail.'}
await mkdir(path.dirname(output),{recursive:true})
await writeFile(output,JSON.stringify(report,null,2)+'\n')
console.log('Regression gates:',gates)
console.log('Report:',output)
if(Object.values(gates).some(value=>!value)) process.exitCode=1
