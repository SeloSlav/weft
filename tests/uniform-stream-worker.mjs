import './headless-preset-canvas.mjs'
import {readFileSync} from 'node:fs'
import {pathToFileURL} from 'node:url'
import assert from 'node:assert/strict'
const mode=process.argv[3]
document.body=null
const Base=globalThis.OffscreenCanvas
globalThis.OffscreenCanvas=class extends Base { getContext(...args){const ctx=super.getContext(...args),measure=ctx.measureText.bind(ctx);ctx.measureText=text=>({width:measure(text).width*(mode==='authority'?.55:2.1)});return ctx} }
const sdk=await import(pathToFileURL(process.argv[2]).href)
const effect=sdk.createGrassEffect({seedCursor:sdk.seedCursor,initialParams:{...sdk.DEFAULT_GRASS_FIELD_PARAMS,layoutDensity:.2}})
try {
  effect.update(0)
  if(mode==='authority'){
    const {encoder,keyframe,streamId}=await sdk.createSurfaceAnimationUniformEncoder(effect,0)
    effect.update(.1);const first=await encoder.capture(1)
    effect.update(.2);const second=await encoder.capture(2)
    const expected=sdk.captureSurfaceAnimationBinary(effect,2)
    console.log(JSON.stringify({keyframe:Buffer.from(keyframe).toString('base64'),streamId:Buffer.from(streamId).toString('base64'),first:Buffer.from(first).toString('base64'),
      second:Buffer.from(second).toString('base64'),expected:Buffer.from(expected).toString('base64')}))
  } else {
    const input=JSON.parse(readFileSync(0,'utf8'))
    const receiver=await sdk.createSurfaceAnimationUniformDecoder(effect,Buffer.from(input.keyframe,'base64'),Buffer.from(input.streamId,'base64'))
    await receiver.apply(Buffer.from(input.second,'base64'))
    assert.equal(Buffer.compare(sdk.captureSurfaceAnimationBinary(effect,2),Buffer.from(input.expected,'base64')),0)
    await assert.rejects(()=>receiver.apply(Buffer.from(input.first,'base64')),/Stale/)
    console.log('PASS uniform stream reconstructs exact captured state across measurement profiles')
  }
} finally {effect.dispose()}
