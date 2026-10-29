import './headless-preset-canvas.mjs'
import {build} from './build-tools.mjs'
import {mkdir} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import path from 'node:path'
import assert from 'node:assert/strict'
import * as THREE from 'three'
await mkdir('validation.local',{recursive:true})
const file=path.resolve('validation.local/animation-delta-tests.mjs')
const referenceFile=path.resolve('validation.local/animation-delta-reference.mjs')
await build({entryPoints:['src/weft/index.ts'],outfile:file,bundle:true,platform:'node',format:'esm',external:['three','three/*'],logLevel:'silent'})
await build({entryPoints:['tests/fixtures/animationDeltaBaseline.ts'],outfile:referenceFile,bundle:true,platform:'node',format:'esm',external:['three','three/*'],logLevel:'silent'})
const sdk=await import(pathToFileURL(file).href)
const reference=await import(pathToFileURL(referenceFile).href)
const make=()=>{
  const geometry=new THREE.BoxGeometry(),material=new THREE.MeshBasicMaterial()
  geometry.setAttribute('phase',new THREE.InstancedBufferAttribute(new Float32Array(512),1))
  const mesh=new THREE.InstancedMesh(geometry,material,512),group=new THREE.Group()
  mesh.count=400;group.add(mesh)
  const uniform={value:0}
  const effect={group,getAnimationUniforms:()=>({time:uniform.value}),setAnimationUniforms:values=>{uniform.value=values.time}}
  return {effect,mesh,geometry,material,uniform}
}
const source=make(),replica=make()
try {
  const full=(tick)=>sdk.captureSurfaceAnimationBinary(source.effect,tick)
  const first=full(9)
  sdk.applySurfaceAnimationBinary(replica.effect,first)
  source.mesh.instanceMatrix.array[12]=7
  source.geometry.attributes.phase.array[0]=1.25
  source.uniform.value=.25
  const second=full(10)
  const delta=await sdk.encodeSurfaceAnimationDelta(first,second)
  assert.equal(new TextDecoder().decode(delta.subarray(0,4)),'WFD1')
  assert(delta.length<second.length)
  assert.deepEqual(await sdk.decodeSurfaceAnimationDelta(first,delta),second)
  const unalignedFirst=new Uint8Array(first.length+1),unalignedSecond=new Uint8Array(second.length+1)
  unalignedFirst.set(first,1);unalignedSecond.set(second,1)
  const unalignedPacket=await sdk.encodeSurfaceAnimationDelta(unalignedFirst.subarray(1),unalignedSecond.subarray(1))
  assert.deepEqual(await sdk.decodeSurfaceAnimationDelta(unalignedFirst.subarray(1),unalignedPacket),second)
  let baseline=await sdk.applySurfaceAnimationDelta(replica.effect,first,delta)
  assert.deepEqual(sdk.captureSurfaceAnimationFrame(replica.effect,10),sdk.captureSurfaceAnimationFrame(source.effect,10))
  assert.deepEqual(baseline,second)
  const before=JSON.stringify(sdk.captureSurfaceAnimationFrame(replica.effect,10))
  await assert.rejects(()=>sdk.applySurfaceAnimationDelta(replica.effect,null,delta),/previous frame/)
  const wrong=first.slice();wrong[wrong.length-1]^=1
  await assert.rejects(()=>sdk.applySurfaceAnimationDelta(replica.effect,wrong,delta),/baseline hash/)
  await assert.rejects(()=>sdk.applySurfaceAnimationDelta(replica.effect,second,delta),/baseline/)
  const damaged=delta.slice();damaged[damaged.length-1]^=1
  await assert.rejects(()=>sdk.applySurfaceAnimationDelta(replica.effect,first,damaged),/result hash/)
  await assert.rejects(()=>sdk.applySurfaceAnimationDelta(replica.effect,first,delta.subarray(0,delta.length-1)))
  await assert.rejects(()=>sdk.applySurfaceAnimationDelta(replica.effect,first,delta,{maxFrameBytes:second.length-1}),/maxFrameBytes/)
  assert.equal(JSON.stringify(sdk.captureSurfaceAnimationFrame(replica.effect,10)),before)
  // Changing population shifts the following blocks; block-local diff must reconstruct them exactly.
  for(const count of [450,250,400]){
    source.mesh.count=count;source.uniform.value+=.1
    const next=full(11+count)
    const packet=await sdk.encodeSurfaceAnimationDelta(baseline,next)
    const withOffset=new Uint8Array(packet.length+1);withOffset.set(packet,1)
    baseline=await sdk.applySurfaceAnimationDelta(replica.effect,baseline,withOffset.subarray(1))
    assert.deepEqual(baseline,next)
    assert.deepEqual(sdk.captureSurfaceAnimationFrame(replica.effect,11+count),sdk.captureSurfaceAnimationFrame(source.effect,11+count))
  }
  let random=0x12345678
  const nextRandom=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random}
  for(let tick=100;tick<150;tick++){
    source.mesh.count=150+nextRandom()%350
    const matrices=new Uint32Array(source.mesh.instanceMatrix.array.buffer)
    const phases=new Uint32Array(source.geometry.attributes.phase.array.buffer)
    for(let k=0;k<20;k++){
      matrices[nextRandom()%(source.mesh.count*16)]=nextRandom()
      phases[nextRandom()%source.mesh.count]=nextRandom()
    }
    source.uniform.value=tick/60
    const next=full(tick),packet=await sdk.encodeSurfaceAnimationDelta(baseline,next)
    const referencePacket=await reference.encodeSurfaceAnimationDelta(baseline,next)
    assert.equal(Buffer.compare(packet,referencePacket),0,`randomized packet ${tick} differs from baseline`)
    baseline=await sdk.applySurfaceAnimationDelta(replica.effect,baseline,packet)
    assert.equal(Buffer.compare(baseline,next),0,`randomized frame ${tick} differs`)
  }
  // A fully changed matrix forces a self-contained fallback keyframe.
  const old=baseline
  const words=new Uint32Array(source.mesh.instanceMatrix.array.buffer)
  for(let i=0;i<source.mesh.count*16;i++)words[i]^=0x80000000
  for(const attribute of Object.values(source.geometry.attributes)) {
    const values=new Uint32Array(attribute.array.buffer,attribute.array.byteOffset,attribute.array.length)
    const n=attribute.isInstancedBufferAttribute?source.mesh.count*attribute.itemSize:values.length
    for(let i=0;i<n;i++)values[i]^=0x80000000
  }
  const changed=full(1000),keyframe=await sdk.encodeSurfaceAnimationDelta(old,changed)
  assert.deepEqual(keyframe,changed)
  const applied=await sdk.applySurfaceAnimationDelta(replica.effect,null,keyframe)
  assert.deepEqual(applied,changed)
  await assert.rejects(()=>sdk.decodeSurfaceAnimationDelta(null,keyframe,{maxFrameBytes:changed.length-1}),/maxFrameBytes/)
  // Decoding snapshots inputs before awaiting crypto; caller mutations cannot corrupt an in-flight decode.
  const baseCopy=first.slice(),packetCopy=delta.slice()
  const pending=sdk.decodeSurfaceAnimationDelta(baseCopy,packetCopy)
  baseCopy.fill(0);packetCopy.fill(0)
  assert.deepEqual(await pending,second)
  const oldCopy=first.slice(),newCopy=second.slice()
  const encoding=sdk.encodeSurfaceAnimationDelta(oldCopy,newCopy)
  oldCopy.fill(0);newCopy.fill(0)
  assert.deepEqual(await sdk.decodeSurfaceAnimationDelta(first,await encoding),second)
  const bufferBase=Buffer.from(first),bufferPacket=Buffer.from(delta)
  const bufferPending=sdk.decodeSurfaceAnimationDelta(bufferBase,bufferPacket)
  bufferBase.fill(0);bufferPacket.fill(0)
  assert.deepEqual(await bufferPending,second,'Node Buffers must be copied before asynchronous verification')
  const bufferFull=Buffer.from(changed),fullPending=sdk.decodeSurfaceAnimationDelta(null,bufferFull)
  bufferFull.fill(0)
  assert.deepEqual(await fullPending,changed,'Keyframes must not alias Node Buffer input')
  const bufferNext=Buffer.from(changed),fallbackPending=sdk.encodeSurfaceAnimationDelta(Buffer.from(old),bufferNext)
  bufferNext.fill(0)
  assert.deepEqual(await fallbackPending,changed,'Fallback keyframes must not alias Node Buffer input')
  const cryptoDescriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto')
  const realCrypto=globalThis.crypto
  let hashCalls=0
  try {
    Object.defineProperty(globalThis,'crypto',{configurable:true,value:{subtle:{digest:(...args)=>{hashCalls++;return realCrypto.subtle.digest(...args)}}}})
    assert.deepEqual(await sdk.encodeSurfaceAnimationDelta(old,changed),changed)
    assert.equal(hashCalls,0,'a high-change fallback should not start unused hashes')
    Object.defineProperty(globalThis,'crypto',{configurable:true,value:undefined})
    assert.deepEqual(await sdk.encodeSurfaceAnimationDelta(old,changed),changed,'keyframe fallback must work without Web Crypto')
    await assert.rejects(()=>sdk.encodeSurfaceAnimationDelta(first,second),/Web Crypto/)
  } finally {
    if(cryptoDescriptor)Object.defineProperty(globalThis,'crypto',cryptoDescriptor)
    else delete globalThis.crypto
  }
  console.log('PASS delta replay, population changes, tick rollover, wrong baselines, corruption, limits, keyframe fallback and async ownership')
} finally {
  for(const item of [source,replica]){item.mesh.dispose();item.geometry.dispose();item.material.dispose()}
}
