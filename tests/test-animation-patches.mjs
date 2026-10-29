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
const oldFile=path.resolve('validation.local/animation-patch-baseline-tests.mjs')
await build({entryPoints:['tests/fixtures/animationPatchBaseline.ts'],outfile:oldFile,bundle:true,platform:'node',format:'esm',external:['three','three/*'],logLevel:'silent'})
const old=await import(pathToFileURL(oldFile).href)
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
  const malformed=first.slice(),view=new DataView(malformed.buffer)
  const record=80+Math.ceil(view.getUint32(72,true)/4)*4
  view.setUint32(record+12,0,true) // Re-sign an invalid length to exercise structural validation.
  malformed.set(new Uint8Array(await crypto.subtle.digest('SHA-256',malformed.subarray(0,-32))),malformed.length-32)
  const replicaBefore=sdk.captureSurfaceAnimationBinary(replica,0)
  await assert.rejects(()=>receiver.apply(malformed),/Invalid patch/)
  assert.equal(Buffer.compare(replicaBefore,sdk.captureSurfaceAnimationBinary(replica,0)),0)
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
{
  const a=sdk.createGrassEffect(options),b=sdk.createGrassEffect(options)
  try{
    a.update(0);b.update(0);a.addDisturbanceFromWorldPoint(new THREE.Vector3(),{strength:1});a.update(.05)
    const boot=await sdk.createSurfaceAnimationPatchEncoder(a,0),receiver=await sdk.createSurfaceAnimationPatchDecoder(b,boot.keyframe,boot.streamId)
    const verify=async tick=>{
      const packet=await boot.encoder.capture(tick);await receiver.apply(packet)
      assert.equal(Buffer.compare(sdk.captureSurfaceAnimationBinary(a,tick),sdk.captureSurfaceAnimationBinary(b,tick)),0)
      return packet
    }
    a.update(.1);a.update(.15);blade(a).instanceMatrix.clearUpdateRanges()
    const first=await verify(1)
    assert.equal(Buffer.from(first.subarray(0,4)).toString(),'WPS3')
    // A direct mutation creates a version not represented in the hint journal.
    const matrix=blade(a).instanceMatrix;matrix.array[12]+=10;matrix.needsUpdate=true
    a.update(.2);await verify(2)
    // Falling behind the bounded history must likewise fall back to a full scan.
    for(let i=1;i<=20;i++)a.update(.2+i/60)
    await verify(3)
    console.log('PASS dirty journal across renderer clearing, skipped updates and version gaps')
  }finally{a.dispose();b.dispose()}
}
{
  const make=()=>{
    const group=new THREE.Group(),mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial(),8)
    group.add(mesh);let time=0
    return {group,mesh,getAnimationUniforms:()=>({time}),setAnimationUniforms:values=>{time=values.time}}
  }
  const a=make(),b=make(),c=make()
  try{
    const boot=await old.createSurfaceAnimationPatchEncoder(a,0),receiver=await sdk.createSurfaceAnimationPatchDecoder(b,boot.keyframe,boot.streamId)
    a.mesh.instanceMatrix.array[12]=1;a.mesh.instanceMatrix.needsUpdate=true
    const legacy=await boot.encoder.capture(1)
    assert.equal(Buffer.from(legacy.subarray(0,4)).toString(),'WPS1');await receiver.apply(legacy)
    assert.equal(b.mesh.instanceMatrix.array[12],1)
    const fresh=await sdk.createSurfaceAnimationPatchEncoder(a,1),newReceiver=await sdk.createSurfaceAnimationPatchDecoder(c,fresh.keyframe,fresh.streamId)
    const words=new Uint32Array(a.mesh.instanceMatrix.array.buffer)
    for(let i=0;i<words.length;i+=2)words[i]^=0x80000000
    a.mesh.instanceMatrix.needsUpdate=true
    const sparse=await fresh.encoder.capture(2)
    assert.equal(Buffer.from(sparse.subarray(0,4)).toString(),'WPS2','sparse high-bit changes should use absolute words')
    await newReceiver.apply(sparse)
    assert.deepEqual(new Uint32Array(c.mesh.instanceMatrix.array.buffer),words)
    for(let i=0;i<words.length;i++)words[i]^=0x80000000
    a.mesh.instanceMatrix.needsUpdate=true
    const dense=await fresh.encoder.capture(3)
    assert.equal(Buffer.from(dense.subarray(0,4)).toString(),'WPS1','dense changes should use full blocks')
    await newReceiver.apply(dense)
    assert.deepEqual(new Uint32Array(c.mesh.instanceMatrix.array.buffer),words)
    console.log('PASS WPS1 compatibility and sparse/dense format fallback')
  }finally{for(const x of [a,b,c]){x.mesh.dispose();x.mesh.geometry.dispose();x.mesh.material.dispose()}}
}
const authority=spawnSync(process.execPath,['tests/patch-stream-worker.mjs',file,'authority'],{encoding:'utf8',maxBuffer:64*1024*1024})
if(authority.status!==0)throw new Error((authority.stderr||authority.error?.message||'Authority failed').slice(0,4000))
const remote=spawnSync(process.execPath,['tests/patch-stream-worker.mjs',file,'replica'],{input:authority.stdout,encoding:'utf8',maxBuffer:64*1024*1024})
if(remote.status!==0)throw new Error((remote.stderr||remote.error?.message||'Replica failed').slice(0,4000))
console.log(remote.stdout.trim())
