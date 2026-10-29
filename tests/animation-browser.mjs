import * as THREE from 'three'
import {WebGPURenderer} from 'three/webgpu'
import * as sdk from '/src/weft/index.ts'

const output=document.querySelector('#result'), lines=[]
function report(s){lines.push(s);output.textContent=lines.join('\n')}
function objects(root){const a=[];root.traverse(o=>{if(o.isMesh)a.push(o)});return a}
function shareMaps(a,b){
  const left=objects(a),right=objects(b)
  for(let i=0;i<left.length;i++){
    const lm=Array.isArray(left[i].material)?left[i].material:[left[i].material]
    const rm=Array.isArray(right[i].material)?right[i].material:[right[i].material]
    for(let j=0;j<lm.length;j++)if('map' in lm[j] && 'map' in rm[j])rm[j].map=lm[j].map
  }
}
function scene(effect){const scene=new THREE.Scene();scene.background=new THREE.Color('#102030');scene.add(new THREE.AmbientLight(0xffffff,3));scene.add(effect.group);return scene}
function camera(name){const c=new THREE.PerspectiveCamera(48,1,.1,100);if(name==='grass'){c.position.set(0,4,8);c.lookAt(0,0,0)}else{c.position.set(0,3,15);c.lookAt(0,3,0)}return c}
const specs={
  fungus:()=>sdk.createFungusSeamEffect({seedCursor:sdk.seedCursor}),
  grass:()=>sdk.createGrassEffect({seedCursor:sdk.seedCursor,initialParams:{...sdk.DEFAULT_GRASS_FIELD_PARAMS,layoutDensity:.2}}),
  fire:()=>sdk.createFireWallEffect({seedCursor:sdk.seedCursor}),
  shell:()=>sdk.createShellSurfaceEffect({seedCursor:sdk.seedCursor,appearance:'shutter'}),
}
try {
  const response=await fetch('/validation.local/animation-frames.json')
  if(!response.ok)throw new Error(`Fixture fetch failed: ${response.status}`)
  const frames=await response.json(), effects={}
  for(const [name,create] of Object.entries(specs)){
    const authority=create(),replica=create(),update=e=>name==='fungus'?e.update(0,()=>0):e.update(0)
    update(authority);update(replica)
    for(const frame of frames[name]){
      sdk.applySurfaceAnimationFrame(replica,frame)
      if(JSON.stringify(sdk.captureSurfaceAnimationFrame(replica,frame.transform.tick))!==JSON.stringify(frame))throw new Error(`${name}: transferred state mismatch`)
    }
    sdk.applySurfaceAnimationFrame(authority,frames[name].at(-1));shareMaps(authority.group,replica.group)
    effects[name]={authority,replica};report(`PASS ${name}: 3 authoritative animation frames reproduce exactly`)
  }
  const size=128,glRenderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true})
  glRenderer.setPixelRatio(1);glRenderer.setSize(size,size,false)
  const shaderErrors=[]
  glRenderer.debug.onShaderError=(gl,program,vertex,fragment)=>shaderErrors.push(`${gl.getProgramInfoLog(program)} ${gl.getShaderInfoLog(vertex)} ${gl.getShaderInfoLog(fragment)}`)
  for(const name of ['grass','shell']){
    const {authority,replica}=effects[name],c=camera(name),a=scene(authority),b=scene(replica)
    const gl=glRenderer.getContext(),first=new Uint8Array(size*size*4),second=new Uint8Array(size*size*4)
    glRenderer.render(a,c);gl.readPixels(0,0,size,size,gl.RGBA,gl.UNSIGNED_BYTE,first)
    glRenderer.render(b,c);gl.readPixels(0,0,size,size,gl.RGBA,gl.UNSIGNED_BYTE,second)
    const glError=gl.getError()
    if(glError!==gl.NO_ERROR || shaderErrors.length)throw new Error(`${name}: WebGL error ${glError}; ${shaderErrors.join(' ')}`)
    let different=0, changed=0;for(let i=0;i<first.length;i++)if(first[i]!==second[i])different++
    for(let i=4;i<first.length;i+=4)if(first[i]!==first[0] || first[i+1]!==first[1] || first[i+2]!==first[2])changed++
    if(!changed)throw new Error(`${name}: WebGL draw was empty`)
    if(different)throw new Error(`${name}: ${different} WebGL pixel components differ`)
    report(`PASS ${name}: WebGL authority and replica draws match`)
  }
  let gpu,target
  if(navigator.gpu){
    gpu=new WebGPURenderer({antialias:false});await gpu.init();gpu.setPixelRatio(1);gpu.setSize(size,size,false)
    target=new THREE.RenderTarget(size,size,{depthBuffer:true})
    for(const name of ['grass','shell']){
      const {authority,replica}=effects[name],c=camera(name),a=scene(authority),b=scene(replica)
      gpu.setRenderTarget(target);await gpu.renderAsync(a,c);const first=new Uint8Array(await gpu.readRenderTargetPixelsAsync(target,0,0,size,size))
      await gpu.renderAsync(b,c);const second=new Uint8Array(await gpu.readRenderTargetPixelsAsync(target,0,0,size,size))
      let different=0;for(let i=0;i<first.length;i++)if(first[i]!==second[i])different++
      if(different)throw new Error(`${name}: ${different} WebGPU pixel components differ`)
      report(`PASS ${name}: WebGPU authority and replica draws match`)
    }
    gpu.setRenderTarget(null)
  } else report('SKIP WebGPU: navigator.gpu unavailable')
  for(const e of Object.values(effects)){e.authority.dispose();e.replica.dispose()}
  target?.dispose();gpu?.dispose();glRenderer.dispose()
  report('DONE')
} catch(error) {report('FAIL '+(error.stack||String(error)))}
