import {build} from './build-tools.mjs'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import path from 'node:path'
const args=process.argv.slice(2),i=args.indexOf('--output'),output=path.resolve(i<0?'validation.local/animation-patch-paired.json':args[i+1])
await mkdir('validation.local',{recursive:true})
const bundle=path.resolve('validation.local/patch-paired-sdk.mjs'),baseline=path.resolve('validation.local/patch-paired-baseline.mjs'),source='tests/fixtures/animationPatchBaseline.ts'
await build({entryPoints:['src/weft/index.ts'],outfile:bundle,bundle:true,platform:'node',format:'esm',external:['three','three/*'],logLevel:'silent'})
await build({entryPoints:[source],outfile:baseline,bundle:true,platform:'node',format:'esm',external:['three','three/*'],logLevel:'silent'})
const runs=[]
for(let run=0;run<3;run++){
  const pair={}
  for(const mode of run%2?['optimized','baseline']:['baseline','optimized']){
    console.log(`Sustained active grass, run ${run+1}/3: ${mode}…`)
    const child=spawnSync(process.execPath,['--expose-gc','tests/animation-patch-paired-worker.mjs',bundle,baseline,mode],{encoding:'utf8',maxBuffer:4*1024*1024})
    if(child.status!==0)throw Error((child.stderr||child.error?.message||`Worker exited ${child.status}`).slice(0,4000))
    pair[mode]=JSON.parse(child.stdout)
  }
  if(pair.baseline.cases.some((value,i)=>value.instances!==pair.optimized.cases[i].instances || value.endStateHash!==pair.optimized.cases[i].endStateHash))throw Error('Paired workloads ended in different states')
  runs.push(pair)
}
const report={generatedAt:new Date().toISOString(),baseline:{source,sha256:createHash('sha256').update(await readFile(source)).digest('hex')},note:'Each mode runs in its own Node process on identically seeded default grass, with the same current simulation and real recovering and moving disturbances. After 20 warmup ticks, 180 consecutive ticks time source update and capture together, then time receiver apply separately. Source and replica full-frame bytes are compared at the end. Runs alternate baseline/optimized order. Keyframe setup, network, other game logic, rendering and GPU uploads are excluded. Wall times include async Web Crypto and scheduling; this is not a 60 fps application guarantee. Baseline compares the prior WPS1 codec using the current simulation, so it does not measure the grass simulation optimization.',runs}
await mkdir(path.dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n')
console.table(runs.flatMap((pair,index)=>Object.entries(pair).flatMap(([mode,run])=>run.cases.map(r=>({run:index+1,mode,scenario:r.scenario,instances:r.instances,packetKiB:(r.packetBytes.median/1024).toFixed(1),senderMs:r.sender.median.toFixed(2),senderP95:r.sender.p95.toFixed(2),senderP99:r.sender.p99.toFixed(2),senderMax:r.sender.max.toFixed(2),overBudget:r.sender.overBudget,replayMs:r.replay.median.toFixed(2),replayP95:r.replay.p95.toFixed(2)})))))
console.log('Exact end-state parity verified. Report:',output)
