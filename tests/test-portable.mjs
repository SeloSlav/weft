import {build} from './build-tools.mjs'
import {mkdir} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import path from 'node:path'
await mkdir('validation.local',{recursive:true})
const bundle=path.resolve('validation.local/portable-sdk.mjs')
await build({entryPoints:['src/weft/index.ts'],outfile:bundle,bundle:true,platform:'node',format:'esm',external:['three','three/*'],logLevel:'silent'})
function run(profile){
  const child=spawnSync(process.execPath,['tests/portable-worker.mjs',bundle,profile],{encoding:'utf8',maxBuffer:16*1024*1024})
  if(child.status!==0)throw Error(child.stderr||child.stdout)
  return JSON.parse(child.stdout)
}
const narrow=run('narrow'),wide=run('wide')
if(JSON.stringify(narrow.nativeLines)===JSON.stringify(wide.nativeLines))throw Error('Test profiles did not change native layout')
for(const [name,expected] of Object.entries(narrow.result)){
  if(JSON.stringify(expected)!==JSON.stringify(wide.result[name]))throw Error(`Portable placement differs for ${name}`)
  if(!expected.initial.some(mesh=>mesh.count>0))throw Error(`Portable fixture emitted no instances for ${name}`)
  console.log(`PASS ${name}: placement matches across different font metrics and engine profiles`)
}
console.log('Native font-based layout changed as expected; portable fixtures matched.')
