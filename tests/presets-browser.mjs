import * as THREE from 'three'
import {WebGPURenderer} from 'three/webgpu'
import * as sdk from '../src/weft/index.ts'
import {presetCases,seeded,inspectFixture,meshesOf,snapshot} from './preset-fixtures.mjs'

const element=id=>document.getElementById(id)
const output=element('results')
const renderer=new WebGPURenderer({canvas:element('scene'),antialias:true})
await renderer.init()
renderer.setSize(960,540,false);renderer.setPixelRatio(1)
const scene=new THREE.Scene()
scene.background=new THREE.Color('#b8cacc')
scene.add(new THREE.HemisphereLight('#d4e8ff','#6b6445',2))
const sun=new THREE.DirectionalLight('#fff0cd',3);sun.position.set(-7,12,5);scene.add(sun)
const camera=new THREE.PerspectiveCamera(48,960/540,.1,250)
const cases=presetCases(sdk)
let preview
const select=element('preset')
for(let i=0;i<cases.length;i++) {
  const fixture=seeded(cases[i]);const option=document.createElement('option')
  option.value=String(i);option.textContent=fixture.name;select.append(option);fixture.effect.dispose()
}
async function draw(fixture) {
  const old=scene.background
  if(fixture.name.startsWith('shell-')){camera.position.set(7,4,9);camera.lookAt(0,0,0)}
  else if(fixture.name==='book'){camera.position.set(0,4,13);camera.lookAt(0,4,0)}
  else if(fixture.name==='fire'){camera.position.set(0,3,14);camera.lookAt(0,3,0)}
  else if(fixture.name==='stars'){camera.position.set(0,0,0);camera.lookAt(1,.3,0);scene.background=new THREE.Color('#030713')}
  else{camera.position.set(10,6,16);camera.lookAt(0,1,0)}
  scene.add(fixture.effect.group)
  renderer.render(scene,camera)
  scene.remove(fixture.effect.group);scene.background=old
}
async function showPreview() {
  preview?.effect.dispose()
  preview=seeded(cases[Number(select.value)])
  preview.update(1);await draw(preview)
}
select.onchange=showPreview
element('damage').onclick=async()=>{preview.damage?.();preview.update(1.05);await draw(preview)}
element('checks').onclick=async()=>{
  const button=element('checks');button.disabled=true
  const lines=[];let failed=false
  try {
    const baseline={...await import('../validation.local/baseline.js'),seedCursor:sdk.seedCursor}
    const beforeCases=presetCases(baseline)
    for(let index=0;index<cases.length;index++) {
      const before=seeded(beforeCases[index]),after=seeded(cases[index])
      const expected=seeded(()=>inspectFixture(before)),actual=seeded(()=>inspectFixture(after))
      const mismatches=Object.keys(expected).filter(stage=>JSON.stringify(expected[stage])!==JSON.stringify(actual[stage]))
      if(mismatches.length)throw Error(`${after.name}: output mismatch at ${mismatches.join(', ')}`)
      if(!after.effect.getRuntimeStats)throw Error(`${after.name}: missing shared runtime`)
      await draw(after)
      const meshes=meshesOf(after.effect)
      if(meshes.some(mesh=>mesh.instanceMatrix.updateRanges.length>0))throw Error(`${after.name}: draw did not retire pending upload ranges`)
      before.effect.dispose();after.effect.dispose()
      if(after.effect.getRuntimeStats().cachedRows!==0)throw Error(`${after.name}: retained disposed layout rows`)
      lines.push(`PASS ${after.name}: six output states and WebGPU draw`)
      output.textContent=lines.join('\n')
      await new Promise(resolve=>setTimeout(resolve,0))
    }
    // Callback identity and explicit invalidation both refresh cached static projections.
    let level=0
    const terrain=()=>level
    const band=sdk.createBandFieldEffect({seedCursor:sdk.seedCursor})
    band.update(terrain);const initial=snapshot(band)
    level=2;band.invalidate();band.update(terrain)
    if(JSON.stringify(initial)===JSON.stringify(snapshot(band)))throw Error('Terrain invalidation did not refresh cached projection')
    band.update(()=>0)
    if(JSON.stringify(initial)!==JSON.stringify(snapshot(band)))throw Error('Changing terrain callback did not restore projection')
    band.dispose()
    lines.push('PASS mutable terrain invalidation and callback replacement')
    const flat=()=>0
    const oldNeedles=baseline.createNeedleLitterFieldEffect({seedCursor:sdk.seedCursor})
    const newNeedles=sdk.createNeedleLitterFieldEffect({seedCursor:sdk.seedCursor})
    for(const cull of [null,{cameraWorld:new THREE.Vector3(-15,0,0),radius:8},
      {cameraWorld:new THREE.Vector3(15,0,0),radius:8},null]) {
      oldNeedles.update(2,flat,cull);newNeedles.update(2,flat,cull)
      if(JSON.stringify(snapshot(oldNeedles))!==JSON.stringify(snapshot(newNeedles)))throw Error('Needle visibility round trip changed authored output')
    }
    oldNeedles.dispose();newNeedles.dispose()
    lines.push('PASS moving needle visibility and complete-field restoration')
    for(const [factory,source] of [
      ['createGrassEffect',()=>sdk.buildGrassStateSurface(2)],
      ['createLeafPileBandEffect',()=>sdk.buildLeafPileSeasonSurface('autumn')],
      ['createLogFieldEffect',()=>sdk.buildLogSeasonSurface('autumn')],
      ['createShrubFieldEffect',()=>sdk.buildShrubSeasonSurface('autumn')],
      ['createTreeFieldEffect',()=>sdk.buildTreeSeasonSurface('autumn')],
    ]) {
      const before=seeded(()=>baseline[factory]({seedCursor:sdk.seedCursor}))
      const after=seeded(()=>sdk[factory]({seedCursor:sdk.seedCursor}))
      for(let change=0;change<3;change++) {
        const surface=source()
        before.setSurface(surface,sdk.seedCursor);after.setSurface(surface,sdk.seedCursor)
        if(factory==='createGrassEffect'){before.update(2);after.update(2)}
        else{before.update(2,flat);after.update(2,flat)}
        if(JSON.stringify(snapshot(before))!==JSON.stringify(snapshot(after)))throw Error(`${factory}: source replacement changed output`)
      }
      before.dispose();after.dispose()
      lines.push(`PASS ${factory}: repeated source replacement`)
    }
  }catch(error){failed=true;lines.push(`FAIL ${error}`)}
  output.className=failed?'fail':'pass';output.textContent=lines.join('\n')
  button.disabled=false
  await showPreview()
}
await showPreview()
window.addEventListener('pagehide',()=>{preview?.effect.dispose();renderer.dispose()},{once:true})
