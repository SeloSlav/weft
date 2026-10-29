import './headless-preset-canvas.mjs'
import {pathToFileURL} from 'node:url'
import {performance} from 'node:perf_hooks'
import {presetCases,seeded,inspectFixture,meshesOf,uploadVersions} from './preset-fixtures.mjs'

const libraries=await Promise.all(process.argv.slice(2,4).map(file=>import(pathToFileURL(file).href)))
const results=[[],[]]
function measure(actions,{warmup=15,samples=25,batch=1}={}) {
  for(let i=0;i<warmup;i++)for(const action of actions)action()
  const times=[[],[]]
  for(let i=0;i<samples;i++) {
    // Alternate AB/BA within every sample, keeping times and simulation steps aligned.
    for(const index of i%2===0?[0,1]:[1,0]) {
      const started=performance.now()
      for(let j=0;j<batch;j++)actions[index]()
      times[index].push((performance.now()-started)/batch)
    }
  }
  return times.map(values=>{
    values.sort((a,b)=>a-b)
    return {medianMs:values[Math.floor(samples/2)],p95Ms:values[Math.min(samples-1,Math.floor(samples*.95))],samples,batch}
  })
}
const fixtures=libraries.map(sdk=>presetCases(sdk))
for(let caseIndex=0;caseIndex<fixtures[0].length;caseIndex++) {
  const states=fixtures.map(cases=>{
    const fixture=seeded(cases[caseIndex])
    const state=seeded(()=>inspectFixture(fixture))
    fixture.effect.dispose()
    return state
  })
  const benches=fixtures.map(cases=>seeded(cases[caseIndex]))
  const updates=benches.map(bench=>{let elapsed=2;return()=>{elapsed+=1/60;bench.update(elapsed)}})
  const cold=measure(updates,{warmup:0,samples:1})
  // Settle the shell's initial animated pose into its authored frozen pose before idle counters.
  for(let i=0;i<4;i++)for(const update of updates)update()
  const versions=benches.map(bench=>uploadVersions(bench.effect))
  const initialStats=benches.map(bench=>bench.effect.getRuntimeStats?.())
  const idle=measure(updates,{batch:20})
  const afterIdle=benches.map(bench=>bench.effect.getRuntimeStats?.())
  const versionDelta=benches.map((bench,index)=>uploadVersions(bench.effect).reduce((sum,value,attribute)=>sum+value-versions[index][attribute],0))
  const refresh=measure(benches.map((bench,index)=>()=>{bench.params();updates[index]()}))
  for(const bench of benches)bench.damage?.()
  const active=measure(updates)
  for(let index=0;index<benches.length;index++) {
    const bench=benches[index],meshes=meshesOf(bench.effect)
    let disposedMeshes=0
    for(const mesh of meshes)mesh.addEventListener('dispose',()=>disposedMeshes++)
    const stats=bench.effect.getRuntimeStats?.()
    bench.effect.dispose()
    results[index].push({name:bench.name,hasReaction:Boolean(bench.damage),states:states[index],initialCounts:states[index].initial.map(mesh=>mesh.count),
      cold:cold[index],idle:idle[index],refresh:refresh[index],active:active[index],
      idleUploadVersionDelta:versionDelta[index],idleRebuiltRows:afterIdle[index] ? afterIdle[index].rebuiltRows-initialStats[index].rebuiltRows : null,
      idleProjectionPasses:afterIdle[index] ? afterIdle[index].projectionPasses-initialStats[index].projectionPasses : null,
      stats,ownedMeshes:meshes.length,disposedMeshes,cachedRowsAfterDispose:bench.effect.getRuntimeStats?.().cachedRows})
  }
}
console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,
  backend:'CPU only; deterministic measurement and no-op texture canvas; paired AB/BA samples in one process',
  before:{results:results[0]},after:{results:results[1]}}))
