import './headless-preset-canvas.mjs'
import {build} from './build-tools.mjs'
import {mkdir} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {spawnSync} from 'node:child_process'
import path from 'node:path'
import assert from 'node:assert/strict'
import * as THREE from 'three'
await mkdir('validation.local',{recursive:true})
const file=path.resolve('validation.local/animation-patch-tests.mjs')
await build({entryPoints:['src/weft/index.ts'],outfile:file,bundle:true,platform:'node',format:'esm',external:['three','three/*'],logLevel:'silent'})
const sdk=await import(pathToFileURL(file).href)
const options={seedCursor:sdk.seedCursor,initialParams:{...sdk.DEFAULT_GRASS_FIELD_PARAMS,layoutDensity:.2}}
const source=sdk.createGrassEffect(options),replica=sdk.createGrassEffect(options)
const blade=e=>{let mesh;e.group.traverse(o=>{if(o.isInstancedMesh)mesh=o});return mesh}
try{
  source.update(0);replica.update(0)
  const boot=await sdk.createSurfaceAnimationPatchEncoder(source,0)
  await assert.rejects(()=>sdk.createSurfaceAnimationPatchDecoder(replica,boot.keyframe,boot.streamId,{maxFrameBytes:1}),/maxFrameBytes/)
  const other=sdk.createGrassEffect(options);other.update(0)
  const wrongId=boot.streamId.slice();wrongId[0]^=1
  const wrong=await sdk.createSurfaceAnimationPatchDecoder(other,boot.keyframe,wrongId)
  const receiver=await sdk.createSurfaceAnimationPatchDecoder(replica,boot.keyframe,boot.streamId)
  for(const a of [blade(replica).instanceMatrix,blade(replica).instanceColor,...Object.values(blade(replica).geometry.attributes)])a.clearUpdateRanges()
  source.updateWind(.1);const dropped=await boot.encoder.capture(1)
  source.addDisturbanceFromWorldPoint(new THREE.Vector3(0,0,0),{strength:1});source.update(.05);source.update(.1)
  const first=await boot.encoder.capture(2)
  assert(first.length>1024);await assert.rejects(()=>wrong.apply(first),/identity differs/);other.dispose()
  assert.equal(await receiver.apply(first),2)
  assert.deepEqual(sdk.captureSurfaceAnimationFrame(replica,2),sdk.captureSurfaceAnimationFrame(source,2))
  await assert.rejects(()=>receiver.apply(dropped),/Stale/)
  assert(blade(replica).instanceMatrix.updateRanges[0].count<blade(replica).instanceMatrix.array.length)
  source.update(.15);const next=await boot.encoder.capture(3)
  const bad=next.slice();bad[bad.length-1]^=1
  await assert.rejects(()=>receiver.apply(bad),/checksum/)
  const pending=receiver.apply(next);next.fill(0);await pending
  assert.deepEqual(sdk.captureSurfaceAnimationFrame(replica,3),sdk.captureSurfaceAnimationFrame(source,3))
  source.update(.2);const lost=await boot.encoder.capture(4)
  source.update(.25);const later=await boot.encoder.capture(5)
  await assert.rejects(()=>receiver.apply(later),sdk.SurfaceAnimationKeyframeRequiredError)
  await receiver.apply(lost);await receiver.apply(later)
  assert.deepEqual(sdk.captureSurfaceAnimationFrame(replica,5),sdk.captureSurfaceAnimationFrame(source,5))
  source.updateWind(.3);const pendingEncode=boot.encoder.capture(6)
  await assert.rejects(()=>boot.encoder.capture(7),/already in progress/)
  const uniform=await pendingEncode
  const version=blade(replica).instanceMatrix.version
  await receiver.apply(uniform);assert.equal(blade(replica).instanceMatrix.version,version)
  source.updateWind(.4);const packet=await boot.encoder.capture(7)
  const applying=receiver.apply(packet);blade(replica).instanceMatrix.needsUpdate=true
  await assert.rejects(()=>applying,sdk.SurfaceAnimationKeyframeRequiredError)
  blade(source).count--
  await assert.rejects(()=>boot.encoder.capture(8),sdk.SurfaceAnimationKeyframeRequiredError)
  console.log('PASS active patch parity, lost and corrupt packets, partial upload, concurrency and invalidation')
}finally{source.dispose();replica.dispose()}

{
  const make=()=>{
    const group=new THREE.Group(),mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial(),1)
    group.add(mesh);let time=0
    return {group,mesh,getAnimationUniforms:()=>({time}),setAnimationUniforms:values=>{time=values.time}}
  }
  const a=make(),b=make()
  try{
    const boot=await sdk.createSurfaceAnimationPatchEncoder(a,0),receiver=await sdk.createSurfaceAnimationPatchDecoder(b,boot.keyframe,boot.streamId)
    a.mesh.instanceMatrix.array[12]=1;a.mesh.instanceMatrix.needsUpdate=true
    const pending=boot.encoder.capture(1)
    a.mesh.instanceMatrix.array[12]=2;a.mesh.instanceMatrix.needsUpdate=true
    const first=await pending;await receiver.apply(first)
    assert.equal(b.mesh.instanceMatrix.array[12],1,'capture must own its bytes across the digest')
    const second=await boot.encoder.capture(2);await receiver.apply(second)
    assert.equal(b.mesh.instanceMatrix.array[12],2,'the next capture must observe changes during the digest')
    console.log('PASS source mutation during asynchronous patch capture')
  }finally{for(const x of [a,b]){x.mesh.dispose();x.mesh.geometry.dispose();x.mesh.material.dispose()}}
}
const authority=spawnSync(process.execPath,['tests/patch-stream-worker.mjs',file,'authority'],{encoding:'utf8',maxBuffer:64*1024*1024})
if(authority.status!==0)throw new Error((authority.stderr||authority.error?.message||'Authority failed').slice(0,4000))
const remote=spawnSync(process.execPath,['tests/patch-stream-worker.mjs',file,'replica'],{input:authority.stdout,encoding:'utf8',maxBuffer:64*1024*1024})
if(remote.status!==0)throw new Error((remote.stderr||remote.error?.message||'Replica failed').slice(0,4000))
console.log(remote.stdout.trim())
