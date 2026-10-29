import './headless-measurement.mjs'
import {measurementBackend} from './headless-measurement.mjs'
import {pathToFileURL} from 'node:url'
import {performance} from 'node:perf_hooks'
import * as THREE from 'three'

const sdk=await import(pathToFileURL(process.argv[2]).href)
let checksum=0
function measure(action,{before=()=>{},warmup=3,samples=15}={}) {
  for(let i=0;i<warmup;i++) {before();action()}
  const times=[]
  for(let i=0;i<samples;i++) {before();const t=performance.now();action();times.push(performance.now()-t)}
  times.sort((a,b)=>a-b)
  return {medianMs:times[Math.floor(samples/2)],p95Ms:times[Math.min(samples-1,Math.floor(samples*.95))],samples}
}
const unitSurface=key=>sdk.prepareSurfaceText(key,['A','B','C','D','E','F','G','H','I','J'],50)
const results={backend:measurementBackend,node:process.version,platform:process.platform,arch:process.arch,seeding:[],preparation:{},traversal:{},sampling:{},cache:{},execution:{}}
const prepUnits=['A','B','C','D','E','F','G','H','I','J']
let prepId=0
results.preparation.uncachedSource=measure(()=>{
  const source=sdk.prepareSurfaceText('prepare-'+prepId++,prepUnits,500)
  checksum+=source.prepared.segments.length
},{warmup:2,samples:15})
const hotSource=sdk.prepareSurfaceText('hot-prepare',prepUnits,500)
results.preparation.cachedSourceLookups=measure(()=>{
  for(let i=0;i<1000;i++) {
    if(sdk.prepareSurfaceText('hot-prepare',prepUnits,500)!==hotSource) throw new Error('Hot source unexpectedly replaced')
  }
})
results.preparation.note='Uncached handles with shared warm font metrics; hot lookup is a batch of 1000 calls. Current hot lookups validate inputs; the baseline only trusted the key.'
for(const [fixture,surface] of [
  ['periodic-short',unitSurface('benchmark-seeds')],
  ['long-stream',sdk.prepareSurfaceText('benchmark-long',['A','B','C','D','E','F','G','H','I','J'],5000)],
]) for(const rows of [64,128,256,512]) {
  const timing=measure(()=>{
    const seeds=sdk.createBandSeeds({surface,rows,advanceForRow:row=>row*13+5,seedCursor:sdk.seedCursor})
    checksum+=seeds.at(-1).segmentIndex
  },{before:()=>sdk.clearSeedCursorCache?.(),warmup:1,samples:7})
  results.seeding.push({fixture,rows,...timing,layoutSteps:sdk.getSeedCursorStats?.().layoutSteps ?? rows*5+13*rows*(rows-1)/2})
}
const layout=new sdk.SurfaceLayoutDriver({surface:unitSurface('benchmark-layout'),rows:64,sectors:64,
  seedCursor:sdk.seedCursor,advanceForRow:row=>row*13+5})
const traversal={spanMin:0,spanMax:1024,lineCoordAtRow:row=>row,
  getMaxWidth:slot=>100+(slot.row*64+slot.sector)/100_000,
  onLine:line=>{checksum+=line.resolvedGlyphs.length}}
layout.forEachLaidOutLine(traversal)
layout.resetStats?.()
results.traversal={...measure(()=>layout.forEachLaidOutLine(traversal)),slots:4096,stats:layout.getStats?.() ?? null}
layout.dispose?.()
const field=sdk.createSurfaceMotionField({minX:-1000,maxX:1000,minZ:-1000,maxZ:1000})
for(let i=0;i<64;i++) field.writeImpulse(i*12,0,{radius:4,strength:1,directionX:1,occupancy:1})
field.update(1/60)
const target={offsetX:0,offsetZ:0,flowX:0,flowZ:0,occupancy:0,angular:0}
results.sampling={...measure(()=>{
  for(let i=0;i<10_000;i++) {
    const x=i%4===0 ? (i%64)*12 : -500
    const sample=field.sampleInto ? field.sampleInto(x,0,target) : field.sample(x,0)
    checksum+=sample.flowX
  }
}),samplesPerBatch:10_000,packets:64,mode:field.sampleInto ? 'caller-owned sampleInto target' : 'allocating sample()',resultObjectsPerBatch:field.sampleInto ? 0 : 10_000}
sdk.clearSurfaceCaches?.({measurements:true})
// Warm shared font measurement before GC; unique keys share text/metrics to isolate Weft retention.
sdk.prepareSurfaceText('cache-warmup',['A','B','C'],8)
global.gc?.()
const heapBefore=process.memoryUsage().heapUsed
const weakSources=[]
const cacheTiming=measure(()=>{
  sdk.clearSurfaceCaches?.()
  for(let i=0;i<2048;i++) weakSources.push(new WeakRef(sdk.prepareSurfaceText('bounded-'+i,['A','B','C'],8)))
},{warmup:0,samples:1})
// WeakRefs pin targets for their current job; advance the event loop before collecting.
await new Promise(resolve=>setImmediate(resolve))
global.gc?.()
results.cache={...cacheTiming,requestedSources:2048,retainedHeapDeltaBytes:process.memoryUsage().heapUsed-heapBefore,
  retainedRequestedSources:weakSources.filter(ref=>ref.deref()!==undefined).length,
  stats:sdk.getSurfaceCacheStats?.() ?? null,
  note:'Heap delta includes dependency/runtime caches; deterministic entry/text caps are the memory regression gate.'}

if(sdk.createSurfaceRuntime) {
  const definition=sdk.createSurfaceEffect({id:'bench-shared',source:unitSurface('runtime-benchmark'),
    layout:sdk.fieldLayout({rows:64,sectors:32,advanceForRow:r=>r*13+5}),
    renderer:sdk.threeInstancedMeshRenderer({geometry:new THREE.PlaneGeometry(.1,.2),material:new THREE.MeshBasicMaterial(),maxInstances:50_000})})
  let offset=0
  const runtime=definition.createRuntime({spanMin:0,spanMax:128,lineCoordAtRow:r=>r,getMaxWidth:()=>60,
    projectGlyph:({slot,glyphIndex},{transform})=>transform.position.set(slot.spanStart+glyphIndex*.1,offset,slot.lineCoord),disposeResources:true})
  runtime.update(0)
  const before=runtime.getStats()
  let elapsed=0
  results.execution.idle=measure(()=>runtime.update(elapsed+=1/60),{warmup:10,samples:50})
  const after=runtime.getStats()
  results.execution.idle.projectedInstances=after.projectedInstances-before.projectedInstances
  results.execution.idle.bufferWrites=after.bufferWrites-before.bufferWrites
  const partialBefore=runtime.getStats()
  results.execution.dirtyRow=measure(()=>{offset++;runtime.invalidateRows(32);runtime.update(elapsed+=1/60)},{warmup:3,samples:30})
  const partialAfter=runtime.getStats()
  results.execution.dirtyRow.projectedInstancesPerUpdate=(partialAfter.projectedInstances-partialBefore.projectedInstances)/33
  const fullBefore=runtime.getStats()
  results.execution.fullInvalidation=measure(()=>{offset++;runtime.invalidate();runtime.update(elapsed+=1/60)},{warmup:3,samples:15})
  const fullAfter=runtime.getStats()
  results.execution.fullInvalidation.projectedInstancesPerUpdate=(fullAfter.projectedInstances-fullBefore.projectedInstances)/18
  results.execution.visibleInstances=runtime.mesh.count
  results.execution.layoutStats=runtime.getLayoutStats()
  runtime.dispose()
} else results.execution={note:'Baseline has no shared execution runtime; compare current dirty-row work with current full invalidation.'}
results.checksum=checksum
console.log(JSON.stringify(results))
