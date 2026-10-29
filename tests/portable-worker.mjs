import './headless-preset-canvas.mjs'
import {pathToFileURL} from 'node:url'
import {runPortableFixtures} from './portable-fixtures.mjs'
const profile=process.argv[3]
document.body=null
const BaseCanvas=globalThis.OffscreenCanvas
globalThis.OffscreenCanvas=class extends BaseCanvas {
  getContext(...args) {
    const ctx=super.getContext(...args), measure=ctx.measureText.bind(ctx)
    ctx.measureText=text=>({width:measure(text).width*(profile==='wide' ? 2.1 : 0.55)})
    return ctx
  }
}
Object.defineProperty(globalThis,'navigator',{configurable:true,value:profile==='wide'
  ? {userAgent:'Version/17 Safari/605.1.15',vendor:'Apple Computer, Inc.'}
  : {userAgent:'Chrome/128.0.0.0 Safari/537.36',vendor:'Google Inc.'}})
const sdk=await import(pathToFileURL(process.argv[2]).href)
const result=runPortableFixtures(sdk)
const native=sdk.getPreparedBandSurface()
const layout=new sdk.SurfaceLayoutDriver({surface:native,rows:2,sectors:4,advanceForRow:r=>r*13+5,seedCursor:sdk.seedCursor})
const nativeLines=[]
layout.forEachLaidOutLine({spanMin:0,spanMax:20,lineCoordAtRow:r=>r,getMaxWidth:()=>40,onLine:line=>nativeLines.push(line.tokenLineKey)})
layout.dispose()
console.log(JSON.stringify({result,nativeLines}))
