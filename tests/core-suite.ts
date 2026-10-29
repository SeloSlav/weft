import {layoutNextLine} from '@chenglou/pretext'
import * as THREE from 'three'
import * as core from '../src/weft/core'
import {createSurfaceMotionField, decayRecoveringStrength, updateRecoveringImpacts} from '../src/weft/runtime'
import {createSurfaceEffect, createSurfaceSource, fieldLayout, recoverableDamage, threeInstancedMeshRenderer} from '../src/weft/three/api'
import {SurfaceExecutionRuntime} from '../src/weft/three/executionRuntime'

type Check = {name:string; passed:boolean; error?:string}
function assert(value:unknown, message = 'assertion failed'): asserts value { if (!value) throw new Error(message) }
function equal(a:unknown,b:unknown,message = 'values differ') { assert(JSON.stringify(a) === JSON.stringify(b),message) }
function near(a:number,b:number,epsilon=1e-10) { assert(Math.abs(a-b) < epsilon,`${a} != ${b}`) }
function throws(fn:()=>unknown) { let failed=false; try {fn()} catch {failed=true} assert(failed,'expected an error') }

export function runCoreChecks(): Check[] {
  const results:Check[]=[]
  const test=(name:string,fn:()=>void)=>{
    try {fn();results.push({name,passed:true})} catch(error) {results.push({name,passed:false,error:String(error)})}
    finally {core.configureSurfaceCaches({maxEntries:128,maxTextUnits:1_000_000});core.clearSurfaceCaches()}
  }
  const source=()=>core.prepareSurfaceText('core-fixture',['A','B','C','D','E','F','G','H','I','J'],20)
  const driver=(rows=4,sectors=8)=>new core.SurfaceLayoutDriver({surface:source(),rows,sectors,seedCursor:core.seedCursor,advanceForRow:row=>row*13+5})
  const collect=(layout:core.SurfaceLayoutDriver,options:Partial<core.LayoutTraversalOptions>={})=>{
    const lines:core.SurfaceLayoutLine[]=[]
    layout.forEachLaidOutLine({spanMin:0,spanMax:32,lineCoordAtRow:row=>row,getMaxWidth:()=>40,
      ...options,onLine:line=>lines.push(line)})
    return lines
  }

  test('shared execution replays rows and rebuilds exactly the row whose width changes',()=>{
    const layout={surface:source(),rows:4,sectors:8,seedCursor:core.seedCursor,advanceForRow:(row:number)=>row*13+5}
    const runtime=new SurfaceExecutionRuntime(layout)
    let changed=false
    const options={spanMin:0,spanMax:32,lineCoordAtRow:(row:number)=>row,
      getMaxWidth:(slot:core.SurfaceLayoutSlot)=>changed && slot.row===2 && slot.sector===1 ? 91.001 : 40}
    const read=()=>{const lines:core.SurfaceLayoutLine[]=[];runtime.forEachLaidOutLine({...options,onLine:l=>lines.push(l)});return lines}
    const first=read();runtime.resetStats();equal(read(),first)
    assert(runtime.getStats().rebuiltRows===0 && runtime.getStats().replayedRows===4)
    assert(runtime.getLayoutStats()!.slotsVisited===0,'warm replay entered the line driver')
    changed=true;const next=read()
    equal(next,collect(new core.SurfaceLayoutDriver(layout),options))
    assert(runtime.getStats().rebuiltRows===1,'local reflow rebuilt unrelated rows')
    runtime.dispose();assert(runtime.getStats().cachedRows===0);throws(read)
  })
  test('shared execution tracks culling, geometry, zero widths and retry after invalid input',()=>{
    const options={surface:source(),rows:4,sectors:8,seedCursor:core.seedCursor,advanceForRow:(row:number)=>row*7}
    const runtime=new SurfaceExecutionRuntime(options)
    const reference=new core.SurfaceLayoutDriver(options)
    let hidden=false,invalid=false,width=40,shift=0
    const traversal=()=>({spanMin:-3+shift,spanMax:29+shift,lineCoordAtRow:(row:number)=>row+shift,
      rowOffsetAt:(row:number,step:number)=>(row%2)*step*.43,
      getMaxWidth:(slot:core.SurfaceLayoutSlot)=>invalid && slot.sector===4 ? NaN : slot.sector===1 ? 0 : width+slot.row,
      shouldVisitSlot:(slot:core.SurfaceLayoutSlot)=>!hidden || slot.sector>3})
    const read=()=>{const lines:core.SurfaceLayoutLine[]=[];runtime.forEachLaidOutLine({...traversal(),onLine:l=>lines.push(l)});return lines}
    for(const step of [0,1,2,3]) {
      hidden=step===1;shift=step===2?5:0;width=step===3?52.7:40
      equal(read(),collect(reference,traversal()))
      equal(read(),collect(reference,traversal()))
    }
    width=84;invalid=true;throws(read);invalid=false
    equal(read(),collect(reference,traversal()),'failed traversal poisoned row cache')
    runtime.dispose();reference.dispose()
  })
  test('shared execution retries failed projections and disposes each mesh while borrowing assets',()=>{
    const runtime=new SurfaceExecutionRuntime()
    let calls=0
    throws(()=>runtime.run('pose',[1],()=>{throw Error('retry')}))
    runtime.run('pose',[1],()=>calls++);runtime.run('pose',[1],()=>calls++)
    runtime.invalidate();runtime.run('pose',[1],()=>calls++)
    assert(calls===2 && runtime.getStats().skippedPasses===1)
    const group=new THREE.Group(),geometry=new THREE.PlaneGeometry(),material=new THREE.MeshBasicMaterial()
    let buffers=0,assets=0
    geometry.addEventListener('dispose',()=>assets++);material.addEventListener('dispose',()=>assets++)
    for(let i=0;i<3;i++) {const mesh=new THREE.InstancedMesh(geometry,material,2);mesh.addEventListener('dispose',()=>buffers++);group.add(mesh)}
    runtime.dispose(group);runtime.dispose(group)
    assert(buffers===3 && assets===0)
    throws(()=>runtime.run('pose',[],()=>{}))
    geometry.dispose();material.dispose()
  })
  test('shared execution width dependencies skip sampling without losing minimum-width or zero-width semantics',()=>{
    const runtime=new SurfaceExecutionRuntime({surface:source(),rows:2,sectors:4,seedCursor:core.seedCursor,advanceForRow:r=>r*3})
    let width=1,samples=0
    const traversal={spanMin:0,spanMax:16,lineCoordAtRow:(row:number)=>row,getMaxWidth:()=>{samples++;return width},onLine:()=>{}}
    runtime.forEachLaidOutLine(traversal,[width]);runtime.resetStats();samples=0
    runtime.forEachLaidOutLine(traversal,[width]);assert(samples===0)
    width=2;runtime.forEachLaidOutLine(traversal,[width])
    assert(runtime.getStats().rebuiltRows===0,'equivalent clamped widths reflowed')
    width=0;runtime.forEachLaidOutLine(traversal,[width])
    assert(runtime.getStats().rebuiltRows===2,'zero width retained stale lines')
    width=30;let restored=0
    runtime.forEachLaidOutLine({...traversal,onLine:()=>restored++},[width])
    assert(restored>0);runtime.dispose()
  })

  test('visibility preserves tokens, widths and cursors of the complete authored layout',()=>{
    const layout=driver()
    const full=collect(layout)
    const visible=collect(layout,{shouldVisitSlot:slot=>slot.sector>=3 && slot.row%2===0})
    equal(visible,full.filter(line=>line.slot.sector>=3 && line.slot.row%2===0))
    equal(collect(layout),full,'visibility round trip changed layout')
  })
  test('zero width reflows identically through hidden prefixes; row intervals preserve seeds',()=>{
    const layout=driver()
    const width=(slot:core.SurfaceLayoutSlot)=>slot.sector===1 ? 0 : 20+slot.sector*4
    const full=collect(layout,{getMaxWidth:width})
    equal(collect(layout,{getMaxWidth:width,shouldVisitSlot:s=>s.sector>2}),full.filter(l=>l.slot.sector>2))
    equal(collect(layout,{getMaxWidth:width,rowStart:2,rowEnd:3}),full.filter(l=>l.slot.row===2))
  })
  test('exact-width caches and callback arrays/cursors cannot poison later traversals',()=>{
    const layout=driver()
    for(const width of [12,80,47.001,47.002,12,120]) {
      const expected=collect(driver(),{getMaxWidth:()=>width})
      const actual=collect(layout,{getMaxWidth:()=>width})
      equal(actual,expected)
      for(const line of actual) {line.glyphs.length=0;line.resolvedGlyphs.length=0;line.cursorStart.segmentIndex=999;line.cursorEnd.segmentIndex=999}
      equal(collect(layout,{getMaxWidth:()=>width}),expected)
    }
  })
  test('large static layouts hit slot transitions instead of thrashing the shared LRU',()=>{
    const layout=driver(64,64)
    const width=(s:core.SurfaceLayoutSlot)=>100+(s.row*64+s.sector)/100_000
    collect(layout,{getMaxWidth:width});layout.resetStats();collect(layout,{getMaxWidth:width})
    assert(layout.getStats().slotCacheHits>4000)
    assert(layout.getStats().lineLayouts===0,'warm traversal repeated line breaking')
    layout.dispose();throws(()=>collect(layout))
  })
  test('Unicode grapheme identities survive culling, rewind and fractional widths',()=>{
    const surface=core.prepareSurfaceText('unicode-core',['🌿','é','𐐀','❘'],3)
    const layout=new core.SurfaceLayoutDriver({surface,rows:6,sectors:8,advanceForRow:r=>r*31,seedCursor:core.seedCursor})
    for(const width of [18.1,32.7,87.01]) {
      const full=collect(layout,{getMaxWidth:()=>width})
      assert(full.length>0)
      equal(collect(layout,{getMaxWidth:()=>width,shouldVisitSlot:s=>s.sector%2===0}),full.filter(l=>l.slot.sector%2===0))
    }
  })
  test('source cache key reuse replaces changed glyphs, weights, fonts, repeat and metadata',()=>{
    const a=core.prepareSurfaceText('same',['A'],2)
    assert(core.prepareSurfaceText('same',['A'],2)===a,'identical simple source missed cache')
    const b=core.prepareSurfaceText('same',['B'],2)
    assert(b!==a && b.palette[0]!.glyph==='B')
    const c=core.prepareSurfaceText('same',['B'],3,'30px monospace')
    assert(c.prepared!==b.prepared)
    const palette=[{id:'leaf',glyph:'X',weight:1,meta:{color:'red'}}]
    const original=core.prepareSemanticSurfaceText('semantic',palette,2)
    palette[0]!.weight=3
    const weighted=core.prepareSemanticSurfaceText('semantic',palette,2)
    assert(weighted!==original && weighted.palette[0]!.weight===3)
    const revised=core.prepareSemanticSurfaceText('semantic',[{...palette[0]!,meta:{color:'blue'}}],2)
    assert(revised.glyphLookup.get('X')!.meta.color==='blue')
    assert(core.prepareCachedSurfaceText('text','A','12px serif')!==core.prepareCachedSurfaceText('text','B','12px serif'))
  })
  test('source caches obey entry/text budgets; release and clear preserve held handles',()=>{
    core.configureSurfaceCaches({maxEntries:3,maxTextUnits:120})
    const retained=source()
    for(let i=0;i<30;i++) core.prepareSurfaceText('key-'+i,['A','B'],4)
    const stats=core.getSurfaceCacheStats()
    assert(stats.text.entries<=3 && stats.sources.entries<=3 && stats.text.weight<=120 && stats.sources.weight<=120)
    assert(stats.text.evictions>0 && stats.sources.evictions>0)
    assert(core.releaseSurfaceSource('key-29'));assert(!core.releaseSurfaceSource('key-29'))
    core.clearSurfaceCaches({measurements:true})
    assert(core.getSurfaceCacheStats().sources.entries===0)
    assert(core.seedCursor(retained.prepared,1).segmentIndex>=0,'held handle was invalidated')
    core.configureSurfaceCaches({maxEntries:0});source();assert(core.getSurfaceCacheStats().sources.entries===0)
    throws(()=>core.configureSurfaceCaches({maxEntries:NaN}))
    throws(()=>core.prepareSurfaceText('bad',['A'],-1))
    throws(()=>core.buildRepeatedUnitStream(['A'],Infinity))
    throws(()=>core.buildWeightedPaletteStream([{id:'bad',glyph:'A',weight:Infinity,meta:{}}],1))
  })
  test('built-in seeding matches original traversal, rewind, fractions and non-monotonic requests',()=>{
    const prepared=source().prepared
    const reference=(advance:number)=>{
      let cursor={segmentIndex:0,graphemeIndex:0}
      for(let i=0;i<advance;i++) cursor=layoutNextLine(prepared,cursor,400)?.end ?? {segmentIndex:0,graphemeIndex:0}
      return cursor
    }
    for(const advance of [0,1,5,18,500,2,1000,15.2,-3,9,50_000,20]) {
      const result=core.seedCursor(prepared,advance)
      equal(result,reference(advance),`seed mismatch at ${advance}`)
      result.segmentIndex=999
      equal(core.seedCursor(prepared,advance),reference(advance))
    }
    const empty=core.prepareSurfaceText('empty',['A'],0)
    equal(core.seedCursor(empty.prepared,1_000_000),{segmentIndex:0,graphemeIndex:0})
    throws(()=>core.seedCursor(prepared,Infinity))
  })
  test('seed checkpoints remain correct after eviction on a long non-repeating traversal',()=>{
    const prepared=core.prepareCachedSurfaceText('long-core-seed','A\n'.repeat(40_000),'20px monospace')
    const reference=(n:number)=>{
      let cursor={segmentIndex:0,graphemeIndex:0}
      for(let i=0;i<n;i++) cursor=layoutNextLine(prepared,cursor,400)?.end ?? {segmentIndex:0,graphemeIndex:0}
      return cursor
    }
    for(const n of [40_001,5,32_768,100,39_900]) equal(core.seedCursor(prepared,n),reference(n))
  })
  test('batch seeding reuses checkpoints and retains custom seed factory semantics',()=>{
    const s=source()
    core.clearSeedCursorCache()
    core.createBandSeeds({surface:s,rows:256,advanceForRow:row=>row*13+5,seedCursor:core.seedCursor})
    assert(core.getSeedCursorStats().layoutSteps<4000,'seeding still repeats prefixes')
    let calls=0
    const seeds=core.createBandSeeds({surface:s,rows:4,advanceForRow:r=>r+1,seedCursor:(_p,n)=>{calls++;return {segmentIndex:n,graphemeIndex:7}}})
    equal(seeds.map(c=>c.segmentIndex),[1,2,3,4]);assert(calls===4)
  })
  test('motion accounts for a full second identically at 1, 20, 60 and 144 updates',()=>{
    const make=()=>{
      const f=createSurfaceMotionField({minX:-100,maxX:100,minZ:-100,maxZ:100})
      f.writeImpulse(0,0,{radius:10,strength:2,directionX:1,directionZ:0.3,occupancy:1,spin:0.4})
      return f
    }
    const one=make();one.update(1)
    const expected=one.sample(0,0)
    for(const steps of [20,60,144]) {
      const f=make();for(let i=0;i<steps;i++) f.update(1/steps)
      for(const key of Object.keys(expected) as (keyof typeof expected)[]) near(f.sample(0,0)[key],expected[key])
      near(f.getStats().simulatedSeconds,1)
    }
  })
  test('motion sampleInto reuses caller storage, clears stale values and handles long pauses',()=>{
    const f=createSurfaceMotionField({minX:-100,maxX:100,minZ:-100,maxZ:100},{drag:0,diffusion:0,occupancyDecay:1})
    const target={offsetX:9,offsetZ:9,flowX:9,flowZ:9,occupancy:9,angular:9}
    assert(f.sampleInto(0,0,target)===target);assert(target.flowX===0 && target.occupancy===0)
    f.writeImpulse(0,0,{radius:10,strength:1,directionX:1,occupancy:1});f.update(1)
    near(f.sample(1,0).offsetX,1);near(f.sample(1,0).flowX,1)
    f.update(3600);assert(!f.hasActivity(),'out-of-bounds packet remained active')
    throws(()=>f.update(Infinity));throws(()=>createSurfaceMotionField(f.bounds,{drag:NaN}))
  })
  test('accelerating recovery is independent of frame cadence, including over-strength impacts',()=>{
    for(const strength of [0.2,0.7,1,1.8]) {
      const expected=decayRecoveringStrength(strength,0.4,1)
      for(const steps of [20,60,144]) {
        let value=strength;for(let i=0;i<steps;i++) value=decayRecoveringStrength(value,0.4,1/steps)
        near(value,expected)
      }
    }
    const impacts=[{id:1,strength:0.01},{id:2,strength:1},{id:3,strength:0.01}]
    updateRecoveringImpacts(impacts,0.1,0.01);equal(impacts.map(i=>i.id),[2])
  })

  function makeRuntime(overrides:Partial<Parameters<ReturnType<typeof makeDefinition>['createRuntime']>[0]>={}) {
    return makeDefinition().createRuntime({spanMin:-4,spanMax:4,lineCoordAtRow:r=>r,getMaxWidth:()=>32,
      projectGlyph:({slot,glyphIndex},{transform,color})=>{transform.position.set(slot.spanStart+glyphIndex*0.3,0,slot.lineCoord);color.set('#55aa77')},
      ...overrides})
  }
  function makeDefinition() {
    return createSurfaceEffect({id:'core-custom',source:createSurfaceSource({cacheKey:'runtime',units:['A','B','C'],repeat:20}),
      layout:fieldLayout({rows:4,sectors:4,advanceForRow:r=>r*3}),
      renderer:threeInstancedMeshRenderer({geometry:new THREE.PlaneGeometry(0.1,0.2),material:new THREE.MeshBasicMaterial(),maxInstances:256}),
      behaviors:[recoverableDamage({radius:2,recoveryRate:1})]})
  }
  test('custom runtime inherits idle caching, per-row projection and partial buffer writes',()=>{
    let offset=0
    const runtime=makeRuntime({projectGlyph:({slot},{transform})=>transform.position.set(offset,0,slot.lineCoord),disposeResources:true})
    runtime.update(0)
    const initial=runtime.getStats();const matrixVersion=runtime.mesh.instanceMatrix.version
    for(let i=1;i<=100;i++) runtime.update(i/60)
    equal(runtime.getStats().projectedInstances,initial.projectedInstances)
    assert(runtime.mesh.instanceMatrix.version===matrixVersion,'idle rewrote matrices')
    offset=7;runtime.invalidateRows(2);runtime.update(2)
    const updated=runtime.getStats()
    assert(updated.projectedSlots-initial.projectedSlots===4,'dirty row rebuilt unrelated rows')
    assert(updated.writtenInstances-initial.writtenInstances<initial.visibleInstances,'dirty row rewrote the full mesh')
    for(let i=0;i<runtime.mesh.count;i++) {
      if(runtime.getInstanceIdentity(i)!.row===2) near(runtime.mesh.instanceMatrix.array[i*16+12],7)
    }
    assert(!runtime.needsUpdate());runtime.dispose();runtime.dispose();throws(()=>runtime.update(3))
  })
  test('custom runtime visibility preserves identities and restores cached poses without reprojection',()=>{
    let visibleStart=0
    const runtime=makeRuntime({shouldVisitSlot:slot=>slot.sector>=visibleStart,disposeResources:true})
    runtime.update(0)
    const poses=Array.from(runtime.mesh.instanceMatrix.array.slice(0,runtime.mesh.count*16))
    const ids=Array.from({length:runtime.mesh.count},(_,i)=>runtime.getInstanceIdentity(i))
    const projections=runtime.getStats().projectedInstances
    visibleStart=2;runtime.update(1)
    equal(Array.from({length:runtime.mesh.count},(_,i)=>runtime.getInstanceIdentity(i)),ids.filter(id=>id!.sector>=2))
    visibleStart=0;runtime.update(2)
    equal(Array.from(runtime.mesh.instanceMatrix.array.slice(0,runtime.mesh.count*16)),poses)
    assert(runtime.getStats().projectedInstances===projections)
    runtime.dispose()
  })
  test('custom runtime restores a completely culled field and updates onFrame without projection',()=>{
    let visible=true
    let frames=0
    const runtime=makeRuntime({shouldVisitSlot:()=>visible,onFrame:()=>{frames++},disposeResources:true})
    runtime.update(0)
    const count=runtime.mesh.count
    const projected=runtime.getStats().projectedInstances
    visible=false;runtime.update(1);assert(runtime.mesh.count===0)
    visible=true;runtime.update(2);assert(runtime.mesh.count===count)
    runtime.update(3)
    assert(frames===4 && runtime.getStats().projectedInstances===projected)
    runtime.dispose()
  })
  test('custom runtime executes recoverable damage and restores layout with elapsed time',()=>{
    const runtime=makeRuntime({disposeResources:true})
    runtime.update(0)
    const original=Array.from(runtime.mesh.instanceMatrix.array.slice(0,runtime.mesh.count*16))
    runtime.addImpact(-3,0,{radius:0.5});runtime.update(0)
    assert(runtime.getStats().activeImpacts===1)
    assert(runtime.mesh.count<original.length/16,'damage did not narrow layout')
    runtime.update(10)
    assert(runtime.getStats().activeImpacts===0)
    equal(Array.from(runtime.mesh.instanceMatrix.array.slice(0,runtime.mesh.count*16)),original)
    runtime.dispose()
  })
  test('custom runtime owns buffers, borrows assets, and supports source replacement',()=>{
    const definition=makeDefinition()
    let geometryDisposed=0
    definition.renderer.config.geometry.addEventListener('dispose',()=>geometryDisposed++)
    const runtime=definition.createRuntime({spanMin:0,spanMax:4,lineCoordAtRow:r=>r,getMaxWidth:()=>32,projectGlyph:()=>{}})
    runtime.update(0)
    runtime.setSource(createSurfaceSource({cacheKey:'replacement',units:['Z'],repeat:10}));runtime.update(1)
    assert(runtime.getInstanceIdentity(0)!.tokenId.includes('5a'))
    runtime.dispose();assert(geometryDisposed===0,'borrowed assets were disposed')
    definition.renderer.config.geometry.dispose();definition.renderer.config.material.dispose()
    const config={...definition,renderer:undefined};throws(()=>createSurfaceEffect(config).createRuntime({spanMin:0,spanMax:1,lineCoordAtRow:r=>r,getMaxWidth:()=>20,projectGlyph:()=>{}}))
  })
  test('custom runtime reports capacity overflow instead of dropping authored cells silently',()=>{
    const definition=makeDefinition()
    definition.renderer.config.maxInstances=1
    const runtime=definition.createRuntime({spanMin:0,spanMax:4,lineCoordAtRow:r=>r,getMaxWidth:()=>40,projectGlyph:()=>{},disposeResources:true})
    throws(()=>runtime.update(0));assert(runtime.mesh.count===0);runtime.dispose()
  })
  return results
}
