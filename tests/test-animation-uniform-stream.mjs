import './headless-preset-canvas.mjs'
import {build} from './build-tools.mjs'
import {mkdir} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {spawnSync} from 'node:child_process'
import path from 'node:path'
import assert from 'node:assert/strict'
import * as THREE from 'three'
await mkdir('validation.local',{recursive:true})
const file=path.resolve('validation.local/animation-uniform-stream-tests.mjs')
await build({entryPoints:['src/weft/index.ts'],outfile:file,bundle:true,platform:'node',format:'esm',external:['three','three/*'],logLevel:'silent'})
const sdk=await import(pathToFileURL(file).href)
const options={seedCursor:sdk.seedCursor,initialParams:{...sdk.DEFAULT_GRASS_FIELD_PARAMS,layoutDensity:.2}}
const source=sdk.createGrassEffect(options),replica=sdk.createGrassEffect(options),other=sdk.createGrassEffect(options)
const blade=effect=>{let found;effect.group.traverse(o=>{if(o.isInstancedMesh)found=o});return found}
try {
  source.update(0);replica.update(0);other.update(0)
  const {encoder,keyframe,streamId}=await sdk.createSurfaceAnimationUniformEncoder(source,0)
  await assert.rejects(()=>sdk.createSurfaceAnimationUniformDecoder(replica,keyframe,streamId,{maxFrameBytes:keyframe.length-1}),/maxFrameBytes/)
  const receiver=await sdk.createSurfaceAnimationUniformDecoder(replica,keyframe,streamId)
  const mesh=blade(replica),matrixVersion=mesh.instanceMatrix.version,windVersion=mesh.geometry.attributes.windPhase.version
  source.update(.1);const first=await encoder.capture(1)
  source.update(.2);const second=await encoder.capture(2)
  assert(first.length<1024 && second.length<1024)
  assert.equal(await receiver.apply(second),2) // Missing the previous absolute packet is safe.
  assert.deepEqual(replica.getAnimationUniforms(),source.getAnimationUniforms())
  assert.equal(mesh.instanceMatrix.version,matrixVersion,'uniform replay uploaded matrices')
  assert.equal(mesh.geometry.attributes.windPhase.version,windVersion,'uniform replay uploaded phases')
  await assert.rejects(()=>receiver.apply(first),/Stale/)
  const saved=replica.getAnimationUniforms()
  source.updateWind(.3);const third=await encoder.capture(3),bad=third.slice();bad[bad.length-1]^=1
  await assert.rejects(()=>receiver.apply(bad),/hash/)
  assert.deepEqual(replica.getAnimationUniforms(),saved)
  const pending=receiver.apply(third);third.fill(0)
  assert.equal(await pending,3)
  assert.deepEqual(replica.getAnimationUniforms(),source.getAnimationUniforms())
  const otherBoot=await sdk.createSurfaceAnimationUniformEncoder(other,0)
  const wrong=await sdk.createSurfaceAnimationUniformDecoder(other,otherBoot.keyframe,otherBoot.streamId)
  source.updateWind(.4);const fourth=await encoder.capture(4)
  // Force a distinct keyframe hash by changing the other source before bootstrapping it.
  other.updateWind(1);const distinct=await sdk.createSurfaceAnimationUniformEncoder(other,1)
  const mismatch=await sdk.createSurfaceAnimationUniformDecoder(other,distinct.keyframe,distinct.streamId)
  await assert.rejects(()=>mismatch.apply(fourth),/keyframe differs/)
  const differentId=streamId.slice();differentId[0]^=1
  const sameFrameOtherSession=await sdk.createSurfaceAnimationUniformDecoder(other,keyframe,differentId)
  await assert.rejects(()=>sameFrameOtherSession.apply(fourth),/identity differs/)
  void wrong
  assert.equal(await receiver.apply(fourth),4)
  source.updateWind(.5)
  const inFlight=encoder.capture(5)
  await assert.rejects(()=>encoder.capture(6),/already in progress/)
  const fifth=await inFlight
  const applying=receiver.apply(fifth)
  await assert.rejects(()=>receiver.apply(fifth),/already in progress/)
  assert.equal(await applying,5)
  // A marked buffer change must not silently use the uniform-only path.
  blade(source).instanceMatrix.needsUpdate=true
  await assert.rejects(()=>encoder.capture(6),sdk.SurfaceAnimationKeyframeRequiredError)
  const nextBoot=await sdk.createSurfaceAnimationUniformEncoder(source,6)
  const nextReceiver=await sdk.createSurfaceAnimationUniformDecoder(replica,nextBoot.keyframe,nextBoot.streamId)
  source.updateWind(.7);const fresh=await nextBoot.encoder.capture(7)
  const applyingWhileChanged=nextReceiver.apply(fresh)
  mesh.instanceMatrix.needsUpdate=true
  await assert.rejects(()=>applyingWhileChanged,sdk.SurfaceAnimationKeyframeRequiredError)
  source.addDisturbanceFromWorldPoint(new THREE.Vector3(0,0,0),{strength:1})
  source.update(.8);source.update(.9)
  await assert.rejects(()=>nextBoot.encoder.capture(8),sdk.SurfaceAnimationKeyframeRequiredError)
  console.log('PASS uniform stream keyframes, wind replay without uploads, packet loss, corruption, mismatch, concurrency and invalidation')
} finally {source.dispose();replica.dispose();other.dispose()}
{
  const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial(),2),group=new THREE.Group()
  group.add(mesh);let mutate=false
  const target={group,getAnimationUniforms:()=>{if(mutate)mesh.instanceMatrix.needsUpdate=true;return {time:0}}}
  try {
    const boot=await sdk.createSurfaceAnimationUniformEncoder(target,0)
    mutate=true
    await assert.rejects(()=>boot.encoder.capture(1),sdk.SurfaceAnimationKeyframeRequiredError)
  } finally {mesh.dispose();mesh.geometry.dispose();mesh.material.dispose()}
}
const authority=spawnSync(process.execPath,['tests/uniform-stream-worker.mjs',file,'authority'],{encoding:'utf8',maxBuffer:64*1024*1024})
if(authority.status!==0)throw new Error((authority.stderr||authority.error?.message||'Authority failed').slice(0,4000))
const remote=spawnSync(process.execPath,['tests/uniform-stream-worker.mjs',file,'replica'],{input:authority.stdout,encoding:'utf8',maxBuffer:64*1024*1024})
if(remote.status!==0)throw new Error((remote.stderr||remote.error?.message||'Replica failed').slice(0,4000))
console.log(remote.stdout.trim())
