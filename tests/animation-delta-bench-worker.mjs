import './headless-preset-canvas.mjs'
import {pathToFileURL} from 'node:url'
import {performance} from 'node:perf_hooks'
import {gzipSync} from 'node:zlib'
import * as THREE from 'three'
import {seeded} from './preset-fixtures.mjs'
const sdk=await import(pathToFileURL(process.argv[2]).href)
const baseline=process.argv[3] ? await import(pathToFileURL(process.argv[3]).href) : null
const options={seedCursor:sdk.seedCursor}
const specs=[
  ['fungus-active',()=>sdk.createFungusSeamEffect(options),'field'],
  ['grass-wind-default',()=>sdk.createGrassEffect(options),'wind'],
  ['grass-active-low',()=>sdk.createGrassEffect({...options,initialParams:{...sdk.DEFAULT_GRASS_FIELD_PARAMS,layoutDensity:.2}}),'grass'],
  ['grass-active-default',()=>sdk.createGrassEffect(options),'grass'],
  ['leaf-active',()=>sdk.createLeafPileBandEffect(options),'field'],
  ['shell-active',()=>sdk.createShellSurfaceEffect({...options,appearance:'shutter'}),'shell'],
  ['fire-active',()=>sdk.createFireWallEffect(options),'fire'],
  ['fungus-full-change',()=>sdk.createFungusSeamEffect(options),'fallback'],
]
const ground=()=>0,point=new THREE.Vector3(0,0,0)
function stats(values,cpu,batch){
  const sorted=[...values].sort((a,b)=>a-b),cpuSorted=[...cpu].sort((a,b)=>a-b)
  const median=Math.floor(sorted.length/2),p95=Math.min(sorted.length-1,Math.floor(sorted.length*.95))
  return {medianMs:sorted[median],p95Ms:sorted[p95],cpuMedianMs:cpuSorted[median],cpuP95Ms:cpuSorted[p95],
    cpuMeanMs:cpu.reduce((sum,value)=>sum+value,0)/cpu.length,samples:sorted.length,batch}
}
async function pair(a,b,batch,samples=7,warmup=2){
  for(let i=0;i<warmup;i++)for(let j=0;j<batch;j++){await a();await b()}
  const results=[[],[]],cpuResults=[[],[]]
  for(let i=0;i<samples;i++)for(const k of i%2?[1,0]:[0,1]){
    const usage=process.cpuUsage(),start=performance.now()
    for(let j=0;j<batch;j++)await(k===0?a():b())
    const elapsed=performance.now()-start,cpu=process.cpuUsage(usage)
    results[k].push(elapsed/batch);cpuResults[k].push((cpu.user+cpu.system)/1000/batch)
  }
  return results.map((values,index)=>stats(values,cpuResults[index],batch))
}
async function sample(action,batch,samples=5,warmup=1){
  for(let i=0;i<warmup*batch;i++)await action()
  const elapsed=[],cpu=[]
  for(let i=0;i<samples;i++){
    const usage=process.cpuUsage(),start=performance.now()
    for(let j=0;j<batch;j++)await action()
    const spent=process.cpuUsage(usage)
    elapsed.push((performance.now()-start)/batch);cpu.push((spent.user+spent.system)/1000/batch)
  }
  return stats(elapsed,cpu,batch)
}
const results=[]
for(const [name,create,kind] of specs){
  const source=seeded(create),replica=seeded(create)
  const update=(effect,t)=>kind==='field'||kind==='fallback' ? effect.update(t,ground) : effect.update(t)
  update(source,0);update(replica,0)
  if(kind==='grass')source.addDisturbanceFromWorldPoint(point,{strength:1})
  else if(kind==='shell')source.addWoundFromWorldPoint(point,new THREE.Vector3(0,0,-1))
  else if(kind==='fire')source.addWoundFromWorldPoint(new THREE.Vector3(0,3,0))
  else if(kind==='field')source.addBurnFromWorldPoint(point)
  update(source,.05);const before=sdk.captureSurfaceAnimationBinary(source,1)
  update(source,.1)
  if(kind==='fallback')source.group.traverse(object=>{
    if(!object.isMesh)return
    const flip=(array,length)=>{const words=new Uint32Array(array.buffer,array.byteOffset,length);for(let i=0;i<words.length;i++)words[i]^=0x80000000}
    if(object.isInstancedMesh){flip(object.instanceMatrix.array,object.count*16);if(object.instanceColor)flip(object.instanceColor.array,object.count*3)}
    for(const attr of Object.values(object.geometry.attributes))flip(attr.array,attr.isInstancedBufferAttribute?object.count*attr.itemSize:attr.array.length)
  })
  const current=sdk.captureSurfaceAnimationBinary(source,2)
  const packet=await sdk.encodeSurfaceAnimationDelta(before,current)
  const reconstructed=await sdk.applySurfaceAnimationDelta(replica,before,packet)
  const parity=Buffer.compare(current,reconstructed)===0
  if(!parity)throw Error(`${name}: delta reconstructed different bytes`)
  const expected=JSON.stringify(sdk.captureSurfaceAnimationFrame(source,2))
  if(JSON.stringify(sdk.captureSurfaceAnimationFrame(replica,2))!==expected)throw Error(`${name}: applied state differs`)
  const batch=kind==='wind'?8:kind==='grass'?5:kind==='fallback'?30:kind==='field'?(name==='fungus-active'?30:20):kind==='shell'?10:8
  const encode=await pair(()=>sdk.captureSurfaceAnimationBinary(source,2),async()=>sdk.encodeSurfaceAnimationDelta(before,sdk.captureSurfaceAnimationBinary(source,2)),batch)
  const replay=await pair(()=>sdk.applySurfaceAnimationBinary(replica,current),()=>sdk.applySurfaceAnimationDelta(replica,before,packet),batch)
  let beforeAfter
  if(baseline){
    const oldPacket=await baseline.encodeSurfaceAnimationDelta(before,current)
    if(Buffer.compare(oldPacket,packet)!==0)throw Error(`${name}: optimized packet differs from baseline`)
    const oldResult=await baseline.applySurfaceAnimationDelta(replica,before,oldPacket)
    if(Buffer.compare(oldResult,current)!==0)throw Error(`${name}: baseline replay differs`)
    const encodeComparison=await pair(()=>baseline.encodeSurfaceAnimationDelta(before,sdk.captureSurfaceAnimationBinary(source,2)),
      ()=>sdk.encodeSurfaceAnimationDelta(before,sdk.captureSurfaceAnimationBinary(source,2)),batch)
    const replayComparison=await pair(()=>baseline.applySurfaceAnimationDelta(replica,before,oldPacket),
      ()=>sdk.applySurfaceAnimationDelta(replica,before,packet),batch)
    beforeAfter={captureAndEncode:{before:encodeComparison[0],after:encodeComparison[1]},
      decodeAndApply:{before:replayComparison[0],after:replayComparison[1]},packetParity:true}
  }
  let instances=0;source.group.traverse(object=>{if(object.isInstancedMesh)instances+=object.count})
  let uniformStream
  if(kind==='wind'){
    // Acknowledged keyframe setup is outside the per-frame timing.
    const streamReplica=seeded(create);update(streamReplica,0)
    const boot=await sdk.createSurfaceAnimationUniformEncoder(source,2)
    const receiver=await sdk.createSurfaceAnimationUniformDecoder(streamReplica,boot.keyframe,boot.streamId)
    const nodes=[];streamReplica.group.traverse(o=>{if(o.isInstancedMesh)nodes.push(o)})
    const versions=nodes.map(m=>[m.instanceMatrix.version,m.instanceColor?.version??0,
      ...Object.values(m.geometry.attributes).map(a=>a.version)])
    let oldTime=0,newTick=2
    const encodeComparison=await pair(()=>{source.updateWind(.1+(++oldTime)/60);return sdk.encodeSurfaceAnimationDelta(before,sdk.captureSurfaceAnimationBinary(source,2))},
      ()=>{source.updateWind(.1+(newTick-1)/60);return boot.encoder.capture(++newTick)},20)
    // Precompute a monotonic sequence so replay measures only receive/apply work.
    const packets=[]
    for(let i=0;i<180;i++){source.updateWind(.1+(newTick-1)/60);packets.push(await boot.encoder.capture(++newTick))}
    let packetIndex=0
    const replayComparison=await pair(()=>sdk.applySurfaceAnimationDelta(replica,before,packet),
      ()=>receiver.apply(packets[packetIndex++]),20)
    // Larger batches make process CPU accounting meaningful for sub-millisecond work.
    const streamEncodeCpu=await sample(()=>{source.updateWind(.1+(newTick-1)/60);return boot.encoder.capture(++newTick)},512)
    const cpuPackets=[]
    for(let i=0;i<3072;i++){source.updateWind(.1+(newTick-1)/60);cpuPackets.push(await boot.encoder.capture(++newTick))}
    let cpuPacketIndex=0
    const streamReplayCpu=await sample(()=>receiver.apply(cpuPackets[cpuPacketIndex++]),512)
    const unchanged=nodes.every((m,i)=>JSON.stringify([m.instanceMatrix.version,m.instanceColor?.version??0,
      ...Object.values(m.geometry.attributes).map(a=>a.version)])===JSON.stringify(versions[i]))
    const expectedUniforms=JSON.parse(new TextDecoder().decode(cpuPackets[cpuPacketIndex-1].subarray(68,-32)))
    const actualUniforms=streamReplica.getAnimationUniforms()
    const windBits=new DataView(new ArrayBuffer(8))
    const uniformParity=expectedUniforms.every(u=>{
      if(!u.scalar || u.bits.length!==2)return false
      windBits.setUint32(0,u.bits[0],false);windBits.setUint32(4,u.bits[1],false)
      return Object.is(actualUniforms[u.name],windBits.getFloat64(0,false))
    })
    if(!unchanged || !uniformParity)throw Error('Uniform stream wrote buffers or lost wind state')
    const packetBytes=packets[0].length
    const bootstrapEncode=await pair(()=>sdk.captureSurfaceAnimationBinary(source,2),
      ()=>sdk.createSurfaceAnimationUniformEncoder(source,2),1,5,1)
    const bootstrapReplay=await pair(()=>sdk.applySurfaceAnimationBinary(replica,boot.keyframe),
      ()=>sdk.createSurfaceAnimationUniformDecoder(replica,boot.keyframe,boot.streamId),1,5,1)
    source.addDisturbanceFromWorldPoint(point,{strength:1});source.update(.15);source.update(.2)
    let changeDetected=false
    try {await boot.encoder.capture(newTick+1)} catch(error) {
      if(error instanceof sdk.SurfaceAnimationKeyframeRequiredError)changeDetected=true
      else throw error
    }
    if(!changeDetected)throw Error('Uniform stream failed to detect the grass disturbance')
    const rekeyEncode=await pair(()=>sdk.captureSurfaceAnimationBinary(source,2),
      ()=>sdk.createSurfaceAnimationUniformEncoder(source,2),1,5,1)
    const activeBoot=await sdk.createSurfaceAnimationUniformEncoder(source,2)
    const rekeyReplay=await pair(()=>sdk.applySurfaceAnimationBinary(replica,activeBoot.keyframe),
      ()=>sdk.createSurfaceAnimationUniformDecoder(replica,activeBoot.keyframe,activeBoot.streamId),1,5,1)
    uniformStream={packetBytes,noBufferWrites:unchanged,uniformParity,
      captureAndEncode:{previous:encodeComparison[0],stream:encodeComparison[1]},
      decodeAndApply:{previous:replayComparison[0],stream:replayComparison[1]},
      batchedCpu:{encode:streamEncodeCpu,replay:streamReplayCpu},
      bootstrap:{keyframeBytes:boot.keyframe.length,fullCapture:bootstrapEncode[0],encoder:bootstrapEncode[1],
        fullApply:bootstrapReplay[0],decoder:bootstrapReplay[1]},
      disturbanceRekey:{changeDetected,keyframeBytes:activeBoot.keyframe.length,
        fullCapture:rekeyEncode[0],encoder:rekeyEncode[1],fullApply:rekeyReplay[0],decoder:rekeyReplay[1]}}
    streamReplica.dispose()
  }
  results.push({name,instances,parity,packetKind:Buffer.from(packet.subarray(0,4)).toString('ascii'),
    previousBytes:before.length,fullBytes:current.length,packetBytes:packet.length,
    fullGzipBytes:gzipSync(current).length,packetGzipBytes:gzipSync(packet).length,
    captureAndEncode:{full:encode[0],delta:encode[1]},decodeAndApply:{full:replay[0],delta:replay[1]},beforeAfter,uniformStream})
  source.dispose();replica.dispose();global.gc?.()
}
console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,results}))
