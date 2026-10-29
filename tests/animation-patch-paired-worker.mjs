import './headless-preset-canvas.mjs'
import {pathToFileURL} from 'node:url'
import {performance} from 'node:perf_hooks'
import {createHash} from 'node:crypto'
import * as THREE from 'three'
import {seeded} from './preset-fixtures.mjs'
const sdk=await import(pathToFileURL(process.argv[2]).href),baseline=await import(pathToFileURL(process.argv[3]).href)
const codec=process.argv[4]==='baseline'?baseline:sdk
function stats(a,time=true){const v=[...a].sort((x,y)=>x-y);return {median:v[Math.floor(v.length/2)],p95:v[Math.ceil(v.length*.95)-1],p99:v[Math.ceil(v.length*.99)-1],max:v.at(-1),...(time?{overBudget:v.filter(t=>t>1000/60).length}:{}),samples:v.length}}
const cases=[]
for(const scenario of ['recovering','moving']){
  const make=()=>seeded(()=>sdk.createGrassEffect({seedCursor:sdk.seedCursor})),source=make(),replica=make(),point=new THREE.Vector3()
  try{
    source.update(0);replica.update(0)
    source.addDisturbanceFromWorldPoint(point,{strength:1,recoveryRate:.2,mergeRadius:2});source.update(.05)
    const boot=await codec.createSurfaceAnimationPatchEncoder(source,0),receiver=await codec.createSurfaceAnimationPatchDecoder(replica,boot.keyframe,boot.streamId)
    let instances=0;source.group.traverse(o=>{if(o.isInstancedMesh)instances+=o.count})
    const update=[],encode=[],sender=[],replay=[],packetBytes=[]
    for(let i=1;i<=200;i++){
      const start=performance.now()
      if(scenario==='moving'){
        point.set(Math.sin(i/60)*.9,0,Math.sin(i/120)*.5)
        source.addDisturbanceFromWorldPoint(point,{strength:1,recoveryRate:.2,mergeRadius:2})
      }
      source.update(.05+i/60);const updated=performance.now()
      const packet=await boot.encoder.capture(i),encoded=performance.now()
      await receiver.apply(packet);const received=performance.now()
      if(i>20){update.push(updated-start);encode.push(encoded-updated);sender.push(encoded-start);replay.push(received-encoded);packetBytes.push(packet.length)}
    }
    const expected=sdk.captureSurfaceAnimationBinary(source,200),actual=sdk.captureSurfaceAnimationBinary(replica,200)
    if(Buffer.compare(expected,actual)!==0)throw Error(`${scenario}: replica does not match authoritative state`)
    cases.push({scenario,instances,keyframeBytes:boot.keyframe.length,endStateHash:createHash('sha256').update(expected).digest('hex'),parity:true,update:stats(update),encode:stats(encode),sender:stats(sender),replay:stats(replay),packetBytes:stats(packetBytes,false)})
  }finally{source.dispose();replica.dispose();global.gc?.()}
}
console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,cases}))
