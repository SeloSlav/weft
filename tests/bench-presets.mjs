import {build} from './build-tools.mjs'
import {execFileSync,spawnSync} from 'node:child_process'
import {mkdir,writeFile} from 'node:fs/promises'
import path from 'node:path'

const root=process.cwd(),args=process.argv.slice(2)
const option=(flag,fallback)=>{const index=args.indexOf(flag);return index<0?fallback:args[index+1]}
const revision=option('--baseline','035a56bb4a8f7cb7bcf8ecdc2baf269e7e359d6e')
const output=path.resolve(option('--output','validation.local/preset-benchmark.json'))
await mkdir('validation.local',{recursive:true})
for(const [label,ref] of [['before',revision],['after',null]]) {
  await build({entryPoints:['src/weft/index.ts'],outfile:`validation.local/presets-${label}.mjs`,bundle:true,
    platform:'node',format:'esm',external:['three','three/*'],logLevel:'silent',
    plugins:ref?[{name:'git-baseline',setup(builder){builder.onLoad({filter:/\.tsx?$/},({path:filename})=>{
      const relative=path.relative(root,filename).replaceAll('\\','/')
      if(!relative.startsWith('src/'))return
      return {contents:execFileSync('git',['show',`${ref}:${relative}`],{encoding:'utf8',maxBuffer:8*1024*1024}),
        loader:filename.endsWith('.tsx')?'tsx':'ts',resolveDir:path.dirname(filename)}
    })}}]:[]})
}
function run() {
  console.log('Running paired baseline/current preset samples…')
  const child=spawnSync(process.execPath,['tests/preset-bench-worker.mjs',path.resolve('validation.local/presets-before.mjs'),path.resolve('validation.local/presets-after.mjs')],
    {encoding:'utf8',maxBuffer:32*1024*1024})
  if(child.status!==0)throw Error(child.stderr||child.stdout||'Preset benchmark failed')
  return JSON.parse(child.stdout.trim())
}
const measured=run(),{before,after}=measured
const cases=after.results.map((current,index)=>{
  const baseline=before.results[index]
  if(baseline.name!==current.name)throw Error('Fixture order mismatch')
  const parity=Object.fromEntries(Object.entries(current.states).map(([stage,state])=>[stage,JSON.stringify(state)===JSON.stringify(baseline.states[stage])]))
  const timings=Object.fromEntries(['cold','idle','refresh','active'].map(phase=>[phase,{before:baseline[phase],after:current[phase],
    speedup:baseline[phase].medianMs/Math.max(current[phase].medianMs,1e-9)}]))
  const {states:_,cold:_cold,idle:_idle,refresh:_refresh,active:_active,...metadata}=current
  return {...metadata,beforeIdleUploadVersionDelta:baseline.idleUploadVersionDelta,parity,timings}
})
const staticNames=cases.filter(row=>!['fire','stars'].includes(row.name)).map(row=>row.name)
const gates={allFamiliesUseRuntime:cases.every(row=>row.stats!==undefined),
  cachedExecutionReused:cases.every(row=>row.stats.replayedRows>0 || row.stats.skippedPasses>0 ||
    (row.stats.projectionPasses>0 && row.idleProjectionPasses===0)),
  outputParity:cases.every(row=>Object.values(row.parity).every(Boolean)),
  staticIdleNoUploads:cases.filter(row=>staticNames.includes(row.name)).every(row=>row.idleUploadVersionDelta===0),
  warmIdleNoReflow:cases.every(row=>row.idleRebuiltRows===0),
  ownedBuffersDisposed:cases.every(row=>row.disposedMeshes===row.ownedMeshes && row.cachedRowsAfterDispose===0)}
console.table(cases.map(row=>({preset:row.name,instances:row.initialCounts.reduce((sum,n)=>sum+(n??0),0),
  'idle ms':row.timings.idle.after.medianMs.toFixed(4),'idle speedup':row.timings.idle.speedup.toFixed(2)+'x',
  'refresh speedup':row.timings.refresh.speedup.toFixed(2)+'x','active speedup':row.hasReaction?row.timings.active.speedup.toFixed(2)+'x':'—',
  parity:Object.values(row.parity).every(Boolean)})))
const report={baselineRevision:revision,generatedAt:new Date().toISOString(),environment:{node:measured.node,platform:measured.platform,arch:measured.arch,backend:measured.backend},
  cases,gates,note:'Same authored densities, seeds and projection math. Timings are observations, not pass/fail thresholds. Cold update is a single observation excluding construction. Refresh includes setParams. CPU-only: GPU rendering and native fonts are checked separately.'}
await mkdir(path.dirname(output),{recursive:true})
await writeFile(output,JSON.stringify(report,null,2)+'\n')
if(!gates.outputParity)await writeFile('validation.local/preset-parity-debug.json',JSON.stringify({before:before.results.map(r=>({name:r.name,states:r.states})),after:after.results.map(r=>({name:r.name,states:r.states}))},null,2))
console.log('Regression gates:',gates)
console.log('Report:',output)
if(Object.values(gates).some(value=>!value))process.exitCode=1
