import './headless-preset-canvas.mjs'
import {pathToFileURL} from 'node:url'
import {performance} from 'node:perf_hooks'
import {presetCases,seeded,inspectFixture,meshesOf,uploadVersions} from './preset-fixtures.mjs'

const sdk=await import(pathToFileURL(process.argv[2]).href)
const results=[]
function measure(action,{warmup=12,samples=21,batch=1}={}) {
  for(let i=0;i<warmup;i++)action()
  const times=[]
  for(let i=0;i<samples;i++) {
    const started=performance.now()
    for(let j=0;j<batch;j++)action()
    times.push((performance.now()-started)/batch)
  }
  times.sort((a,b)=>a-b)
  return {medianMs:times[Math.floor(samples/2)],p95Ms:times[Math.min(samples-1,Math.floor(samples*.95))],samples,batch}
}
for(const make of presetCases(sdk)) {
  const fixture=seeded(make)
  const states=seeded(()=>inspectFixture(fixture))
  fixture.effect.dispose()
  const bench=seeded(make)
  let elapsed=2
  const update=()=>{elapsed+=1/60;bench.update(elapsed)}
  const cold=measure(update,{warmup:0,samples:1})
  // Settle the shell's initial animated pose into its authored frozen pose before idle counters.
  for(let i=0;i<4;i++)update()
  const versions=uploadVersions(bench.effect)
  const initialStats=bench.effect.getRuntimeStats?.()
  const idle=measure(update,{batch:20})
  const afterIdle=bench.effect.getRuntimeStats?.()
  const idleUploadVersionDelta=uploadVersions(bench.effect).reduce((sum,value,index)=>sum+value-versions[index],0)
  const refresh=measure(()=>{bench.params();update()},{warmup:15,samples:21})
  bench.damage?.()
  const active=measure(update)
  const meshes=meshesOf(bench.effect)
  let disposedMeshes=0
  for(const mesh of meshes)mesh.addEventListener('dispose',()=>disposedMeshes++)
  const stats=bench.effect.getRuntimeStats?.()
  bench.effect.dispose()
  results.push({name:bench.name,hasReaction:Boolean(bench.damage),states,initialCounts:states.initial.map(mesh=>mesh.count),cold,idle,refresh,active,
    idleUploadVersionDelta,idleRebuiltRows:afterIdle ? afterIdle.rebuiltRows-initialStats.rebuiltRows : null,
    idleProjectionPasses:afterIdle ? afterIdle.projectionPasses-initialStats.projectionPasses : null,
    stats,ownedMeshes:meshes.length,disposedMeshes,cachedRowsAfterDispose:bench.effect.getRuntimeStats?.().cachedRows})
}
console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,
  backend:'CPU only; deterministic measurement and no-op texture canvas',results}))
