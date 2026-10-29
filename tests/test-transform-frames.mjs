import {build} from './build-tools.mjs'
import {mkdir,writeFile} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import path from 'node:path'
await mkdir('validation.local',{recursive:true})
const bundle=path.resolve('validation.local/transform-frame-sdk.mjs')
await build({entryPoints:['src/weft/index.ts'],outfile:bundle,bundle:true,platform:'node',format:'esm',external:['three','three/*'],logLevel:'silent'})
function run(mode,input,format){
  const child=spawnSync(process.execPath,['tests/transform-frame-worker.mjs',bundle,mode,...(format?[format]:[])],{input,encoding:'utf8',maxBuffer:64*1024*1024})
  if(child.status!==0)throw Error((child.stderr||child.error?.message||`worker exited ${child.status}`).slice(0,4000))
  return child.stdout
}
const frames=run('authority')
const result=JSON.parse(run('replica',frames))
await writeFile('validation.local/animation-frames.json',frames)
for(const [name,count] of Object.entries(result))console.log(`PASS ${name}: ${count} authoritative animation frames reproduced exactly across measurement profiles`)
const compact=run('authority',undefined,'binary')
const compactResult=JSON.parse(run('replica',compact,'binary'))
for(const [name,count] of Object.entries(compactResult))console.log(`PASS ${name}: ${count} binary frames match JSON across measurement profiles`)
const deltas=run('authority',undefined,'delta')
const deltaResult=JSON.parse(run('replica',deltas,'delta'))
for(const [name,count] of Object.entries(deltaResult))console.log(`PASS ${name}: ${count} keyframe/delta packets match JSON across measurement profiles`)
