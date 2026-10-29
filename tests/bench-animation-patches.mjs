import {build} from './build-tools.mjs'
import {mkdir,writeFile} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import path from 'node:path'
const args=process.argv.slice(2),i=args.indexOf('--output'),output=path.resolve(i<0?'validation.local/animation-patch-benchmark.json':args[i+1])
await mkdir('validation.local',{recursive:true})
const bundle=path.resolve('validation.local/animation-patch-benchmark.mjs')
await build({entryPoints:['src/weft/index.ts'],outfile:bundle,bundle:true,platform:'node',format:'esm',external:['three','three/*'],logLevel:'silent'})
const runs=[]
for(let run=0;run<3;run++){
  console.log(`Measuring active interaction, run ${run+1}/3…`)
  const child=spawnSync(process.execPath,['--expose-gc','tests/animation-patch-bench-worker.mjs',bundle],{encoding:'utf8',maxBuffer:4*1024*1024})
  if(child.status!==0)throw Error((child.stderr||child.error?.message||`Worker exited ${child.status}`).slice(0,4000))
  runs.push(JSON.parse(child.stdout))
}
const report={generatedAt:new Date().toISOString(),note:'Each run advances a real disturbance over 30 sequential frames after five warmup frames. One source supplies both codecs; update, old full capture + WFD1 encode, and patch capture + encode are timed separately. Replicas apply the corresponding packets in order and full frame bytes are checked every five frames. Sender total is update plus patch capture/encode; receiver replay is a separate machine/path. Keyframe setup, transport, other game logic, rendering and GPU upload are excluded. Timings are informational and do not prove an overall 60 fps frame.',runs}
await mkdir(path.dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n')
console.table(runs.flatMap((run,index)=>run.cases.map(c=>({run:index+1,case:c.name,instances:c.instances,patchKB:(c.patchBytes.median/1024).toFixed(1),deltaKB:(c.deltaBytes.median/1024).toFixed(1),updateMs:c.update.median.toFixed(2),oldEncodeMs:c.deltaEncode.median.toFixed(2),patchEncodeMs:c.patchEncode.median.toFixed(2),senderMs:c.sender.median.toFixed(2),senderP95:c.sender.p95.toFixed(2),oldReplayMs:c.deltaReplay.median.toFixed(2),patchReplayMs:c.patchReplay.median.toFixed(2),patchReplayP95:c.patchReplay.p95.toFixed(2)}))))
console.log('Exact replay parity checked; report:',output)
