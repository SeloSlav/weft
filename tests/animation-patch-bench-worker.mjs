import './headless-preset-canvas.mjs'
import {pathToFileURL} from 'node:url'
import {performance} from 'node:perf_hooks'
import * as THREE from 'three'
import {seeded} from './preset-fixtures.mjs'
const sdk=await import(pathToFileURL(process.argv[2]).href)
function stats(a){const v=[...a].sort((x,y)=>x-y);return {median:v[Math.floor(v.length/2)],p95:v[Math.ceil(v.length*.95)-1],max:v.at(-1),samples:v.length}}
const cases=[]
for(const [name,density] of [['grass-active-low',.2],['grass-active-default',sdk.DEFAULT_GRASS_FIELD_PARAMS.layoutDensity]]){
  const opts={seedCursor:sdk.seedCursor,initialParams:{...sdk.DEFAULT_GRASS_FIELD_PARAMS,layoutDensity:density}}
  const make=()=>seeded(()=>sdk.createGrassEffect(opts)),source=make(),replica=make(),oldReplica=make()
  source.update(0);replica.update(0);oldReplica.update(0)
  source.addDisturbanceFromWorldPoint(new THREE.Vector3(0,0,0),{strength:1})
  source.update(.05)
  const boot=await sdk.createSurfaceAnimationPatchEncoder(source,0)
  const receiver=await sdk.createSurfaceAnimationPatchDecoder(replica,boot.keyframe,boot.streamId)
  let before=boot.keyframe
  const metrics=Object.fromEntries(['update','deltaEncode','patchEncode','sender','deltaReplay','patchReplay','patchBytes','deltaBytes'].map(k=>[k,[]]))
  let instances=0;source.group.traverse(o=>{if(o.isInstancedMesh)instances+=o.count})
  for(let i=1;i<=35;i++){
    let start=performance.now();source.update(.05+i/60);const update=performance.now()-start
    start=performance.now();const current=sdk.captureSurfaceAnimationBinary(source,i),delta=await sdk.encodeSurfaceAnimationDelta(before,current);const deltaEncode=performance.now()-start
    start=performance.now();const patch=await boot.encoder.capture(i);const patchEncode=performance.now()-start
    let deltaReplay,patchReplay
    if(i%2){start=performance.now();await sdk.applySurfaceAnimationDelta(oldReplica,before,delta);deltaReplay=performance.now()-start;start=performance.now();await receiver.apply(patch);patchReplay=performance.now()-start}
    else {start=performance.now();await receiver.apply(patch);patchReplay=performance.now()-start;start=performance.now();await sdk.applySurfaceAnimationDelta(oldReplica,before,delta);deltaReplay=performance.now()-start}
    if(i%5===0){
      const actual=sdk.captureSurfaceAnimationBinary(replica,i),old=sdk.captureSurfaceAnimationBinary(oldReplica,i)
      if(Buffer.compare(actual,current)||Buffer.compare(old,current))throw Error(`${name}: replica parity failed at ${i}`)
    }
    if(i>5){for(const [key,value] of Object.entries({update,deltaEncode,patchEncode,sender:update+patchEncode,deltaReplay,patchReplay,patchBytes:patch.length,deltaBytes:delta.length}))metrics[key].push(value)}
    before=current
  }
  cases.push({name,instances,keyframeBytes:boot.keyframe.length,parity:true,...Object.fromEntries(Object.entries(metrics).map(([k,v])=>[k,stats(v)]))})
  source.dispose();replica.dispose();oldReplica.dispose();global.gc?.()
}
console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,cases}))

