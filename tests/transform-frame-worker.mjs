import './headless-preset-canvas.mjs'
import {readFileSync} from 'node:fs'
import {pathToFileURL} from 'node:url'
import * as THREE from 'three'
const mode=process.argv[3]
document.body=null
const BaseCanvas=globalThis.OffscreenCanvas
globalThis.OffscreenCanvas=class extends BaseCanvas {
  getContext(...args) {
    const ctx=super.getContext(...args), measure=ctx.measureText.bind(ctx)
    ctx.measureText=text=>({width:measure(text).width*(mode==='authority' ? 0.55 : 2.1)})
    return ctx
  }
}
const sdk=await import(pathToFileURL(process.argv[2]).href)
const specs=[
  ['fungus',()=>sdk.createFungusSeamEffect({seedCursor:sdk.seedCursor}),'field'],
  ['grass',()=>sdk.createGrassEffect({seedCursor:sdk.seedCursor,initialParams:{...sdk.DEFAULT_GRASS_FIELD_PARAMS,layoutDensity:.2}}),'grass'],
  ['fire',()=>sdk.createFireWallEffect({seedCursor:sdk.seedCursor}),'animated'],
  ['shell',()=>sdk.createShellSurfaceEffect({seedCursor:sdk.seedCursor,appearance:'shutter'}),'animated'],
]
const ground=()=>0,point=new THREE.Vector3(0,0,0),result={}
const input=mode==='replica' ? JSON.parse(readFileSync(0,'utf8')) : null
for(const [name,create,kind] of specs){
  const effect=create()
  const update=t=>kind==='field' ? effect.update(t,ground) : effect.update(t)
  update(0)
  if(mode==='authority'){
    result[name]=[sdk.captureSurfaceAnimationFrame(effect,0)]
    if(name==='fungus')effect.addBurnFromWorldPoint(point)
    if(name==='grass')effect.addDisturbanceFromWorldPoint(point,{strength:1})
    if(name==='fire')effect.addWoundFromWorldPoint(new THREE.Vector3(0,3,0))
    if(name==='shell')effect.addWoundFromWorldPoint(point,new THREE.Vector3(0,0,-1))
    update(.05);result[name].push(sdk.captureSurfaceAnimationFrame(effect,1))
    update(.10);result[name].push(sdk.captureSurfaceAnimationFrame(effect,2))
  }else{
    for(const frame of input[name]){
      sdk.applySurfaceAnimationFrame(effect,frame)
      const actual=sdk.captureSurfaceAnimationFrame(effect,frame.transform.tick)
      if(JSON.stringify(actual)!==JSON.stringify(frame))throw Error(`${name} frame ${frame.transform.tick} differs`)
    }
    result[name]=input[name].length
  }
  effect.dispose()
}
console.log(JSON.stringify(result))
