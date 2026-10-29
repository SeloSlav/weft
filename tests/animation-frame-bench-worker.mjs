import './headless-preset-canvas.mjs'
import {pathToFileURL} from 'node:url'
import {performance} from 'node:perf_hooks'
import {gzipSync} from 'node:zlib'
import * as THREE from 'three'
import {seeded} from './preset-fixtures.mjs'

const sdk=await import(pathToFileURL(process.argv[2]).href)
const options={seedCursor:sdk.seedCursor}
const specs=[
  ['fungus',()=>sdk.createFungusSeamEffect(options),'field'],
  ['grass-low',()=>sdk.createGrassEffect({...options,initialParams:{...sdk.DEFAULT_GRASS_FIELD_PARAMS,layoutDensity:.2}}),'grass'],
  ['grass-medium',()=>sdk.createGrassEffect({...options,initialParams:{...sdk.DEFAULT_GRASS_FIELD_PARAMS,layoutDensity:4}}),'grass'],
  ['grass-default',()=>sdk.createGrassEffect(options),'grass'],
  ['leaf-pile',()=>sdk.createLeafPileBandEffect(options),'field'],
  ['shell-shutter',()=>sdk.createShellSurfaceEffect({...options,appearance:'shutter'}),'shell'],
]
const ground=()=>0,point=new THREE.Vector3(0,0,0)
function stats(values){const sorted=[...values].sort((a,b)=>a-b);return {medianMs:sorted[Math.floor(sorted.length/2)],p95Ms:sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))],samples:sorted.length}}
function pair(a,b,samples=9,warmup=3){
  for(let i=0;i<warmup;i++){a();b()}
  const results=[[],[]]
  for(let i=0;i<samples;i++)for(const k of i%2?[1,0]:[0,1]){
    const start=performance.now();(k===0?a:b)();results[k].push(performance.now()-start)
  }
  return results.map(stats)
}
const results=[]
for(const [name,create,kind] of specs){
  const source=seeded(create),replica=seeded(create)
  const update=(effect,t)=>kind==='field' ? effect.update(t,ground) : effect.update(t)
  update(source,0);update(replica,0)
  if(kind==='grass')source.addDisturbanceFromWorldPoint(point,{strength:1})
  else if(kind==='shell')source.addWoundFromWorldPoint(point,new THREE.Vector3(0,0,-1))
  else source.addBurnFromWorldPoint(point)
  update(source,.05);update(source,.1)
  const text=JSON.stringify(sdk.captureSurfaceAnimationFrame(source,6))
  const binary=sdk.captureSurfaceAnimationBinary(source,6)
  sdk.applySurfaceAnimationFrame(replica,JSON.parse(text))
  const expected=JSON.stringify(sdk.captureSurfaceAnimationFrame(replica,6))
  sdk.applySurfaceAnimationBinary(replica,binary)
  const parity=JSON.stringify(sdk.captureSurfaceAnimationFrame(replica,6))===expected
  if(!parity)throw Error(name+': binary replay differs from JSON')
  const encode=pair(()=>JSON.stringify(sdk.captureSurfaceAnimationFrame(source,6)),()=>sdk.captureSurfaceAnimationBinary(source,6))
  const apply=pair(()=>sdk.applySurfaceAnimationFrame(replica,JSON.parse(text)),()=>sdk.applySurfaceAnimationBinary(replica,binary))
  let instances=0;source.group.traverse(object=>{if(object.isInstancedMesh)instances+=object.count})
  const jsonBytes=Buffer.byteLength(text),binaryBytes=binary.byteLength
  const jsonGzipBytes=gzipSync(text).byteLength,binaryGzipBytes=gzipSync(binary).byteLength
  results.push({name,instances,parity,jsonBytes,binaryBytes,jsonGzipBytes,binaryGzipBytes,
    captureAndEncode:{json:encode[0],binary:encode[1]},decodeAndApply:{json:apply[0],binary:apply[1]}})
  source.dispose();replica.dispose();global.gc?.()
}
console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,results}))
