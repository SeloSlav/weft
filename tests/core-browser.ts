import * as THREE from 'three'
import {WebGPURenderer} from 'three/webgpu'
import {runCoreChecks} from './core-suite'
import {createSurfaceEffect,createSurfaceSource,fieldLayout,recoverableDamage,threeInstancedMeshRenderer} from '../src/weft/three'

const element=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T
const renderer=new WebGPURenderer({canvas:element<HTMLCanvasElement>('scene'),antialias:true})
await renderer.init()
renderer.setSize(960,420,false)
renderer.setPixelRatio(1)
const scene=new THREE.Scene()
scene.background=new THREE.Color('#1b303a')
const camera=new THREE.PerspectiveCamera(45,960/420,.1,100)
camera.position.set(8,11,18);camera.lookAt(0,0,0)
let lifted=false
let culled=false
const definition=createSurfaceEffect({id:'shared-runtime-example',
  source:createSurfaceSource({cacheKey:'shared-runtime-native',units:['◓','|','◆'],repeat:40}),
  layout:fieldLayout({rows:8,sectors:16,advanceForRow:row=>row*13+5}),
  renderer:threeInstancedMeshRenderer({geometry:new THREE.BoxGeometry(.12,.5,.12),
    material:new THREE.MeshBasicMaterial(),maxInstances:1024}),
  behaviors:[recoverableDamage({radius:2,recoveryRate:.6})]})
const runtime=definition.createRuntime({spanMin:-8,spanMax:8,lineCoordAtRow:row=>row-4,getMaxWidth:()=>40,
  shouldVisitSlot:slot=>!culled || slot.spanCenter>=0,
  projectGlyph:({glyph,slot,glyphIndex,glyphCount},{transform,color})=>{
    transform.position.set(slot.spanStart+(glyphIndex+.5)/glyphCount*slot.spanSize,
      slot.row===3 && lifted ? 1 : 0,slot.lineCoord)
    color.setHSL(.34+glyph.ordinal*.055,.48,.5)
  },disposeResources:true})
scene.add(runtime.group)
element('row').onclick=()=>{lifted=!lifted;runtime.invalidateRows(3)}
element('visibility').onclick=()=>{culled=!culled;element('visibility').textContent=culled?'Show all':'Cull left half'}
element('damage').onclick=()=>runtime.addImpact(.5,-1)
element('reset').onclick=()=>{lifted=culled=false;runtime.clearImpacts();runtime.invalidate();element('visibility').textContent='Cull left half'}
element('checks').onclick=()=>{
  const results=runCoreChecks()
  const output=element('results')
  try {
    runtime.update(performance.now()/1000)
    renderer.render(scene,camera)
    if(runtime.mesh.instanceMatrix.updateRanges.length!==0) throw new Error('Draw did not retire instance ranges')
    const initial=runtime.getStats()
    const oldVersion=runtime.mesh.instanceMatrix.version
    runtime.update(performance.now()/1000)
    if(runtime.mesh.instanceMatrix.version!==oldVersion) throw new Error('Idle frame uploaded instances')
    lifted=!lifted;runtime.invalidateRows(3);runtime.update(performance.now()/1000)
    const added=runtime.getStats().writtenInstances-initial.writtenInstances
    if(added>=runtime.mesh.count) throw new Error('One row uploaded the whole field')
    renderer.render(scene,camera)
    results.push({name:'native WebGPU draw, idle versions and partial row upload',passed:true})
  } catch(error) {results.push({name:'native WebGPU runtime',passed:false,error:String(error)})}
  output.className=results.every(result=>result.passed)?'pass':'fail'
  output.textContent=results.map(result=>`${result.passed?'PASS':'FAIL'} ${result.name}${result.error?': '+result.error:''}`).join('\n')
}
renderer.setAnimationLoop(()=>{
  runtime.update(performance.now()/1000)
  renderer.render(scene,camera)
  element('stats').textContent=JSON.stringify(runtime.getStats(),null,2)
})
window.addEventListener('pagehide',()=>{runtime.dispose();renderer.dispose()},{once:true})
