import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import path from 'node:path'

// Compare two already-built SDK bundles. Capture the before bundle before editing;
// run bench:presets once after editing to prepare presets-after.mjs.
const [beforeArg='validation.local/fungus-before.mjs',afterArg='validation.local/presets-after.mjs',
  outputArg='validation.local/fungus-immediate-comparison.json']=process.argv.slice(2)
const before=path.resolve(beforeArg),after=path.resolve(afterArg),output=path.resolve(outputArg)
const digest=async file=>createHash('sha256').update(await readFile(file)).digest('hex')
const records=[]
for(let round=1;round<=3;round++) {
  const child=spawnSync(process.execPath,['tests/preset-bench-worker.mjs',before,after],{encoding:'utf8',maxBuffer:64*1024*1024})
  if(child.status!==0)throw Error(child.stderr||child.stdout||'Benchmark worker failed')
  const result=JSON.parse(child.stdout)
  for(let i=0;i<result.before.results.length;i++) {
    const a=result.before.results[i],b=result.after.results[i]
    if(a.name!==b.name || JSON.stringify(a.states)!==JSON.stringify(b.states)) throw Error(`Output parity failed: ${a.name}`)
  }
  for(const name of ['fungus-seam','fungus-dense','fungus-saturated','fungus-mask']) {
    const a=result.before.results.find(row=>row.name===name),b=result.after.results.find(row=>row.name===name)
    const item={round,name,beforeMs:a.active.medianMs,afterMs:b.active.medianMs,
      speedup:a.active.medianMs/Math.max(b.active.medianMs,1e-9),beforeStats:a.cacheWork?.afterActive,afterStats:b.cacheWork?.afterActive}
    records.push(item)
    console.log(`${name} round ${round}: ${item.beforeMs.toFixed(4)} → ${item.afterMs.toFixed(4)} ms (${item.speedup.toFixed(2)}x)`)
  }
}
await mkdir(path.dirname(output),{recursive:true})
await writeFile(output,JSON.stringify({generatedAt:new Date().toISOString(),beforeBundle:beforeArg,afterBundle:afterArg,
  beforeSha256:await digest(before),afterSha256:await digest(after),rounds:3,records,
  note:'The before bundle was captured from an uncommitted working tree and is local/ignored. These are paired CPU samples; parity covers every fixture.'},null,2)+'\n')
console.log('Report:',output)
