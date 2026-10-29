import * as THREE from 'three'

// Same fixtures run in Node and the native-font browser check. No demo density multipliers.
export function presetCases(sdk) {
  const seedCursor=sdk.seedCursor
  const options={seedCursor}
  const ground=(x,z)=>Math.sin(x*.13)*.12+Math.cos(z*.17)*.08
  const point=new THREE.Vector3(0,0,0)
  const cases=[]
  const field=(name,factory,initialParams,extra={})=>{
    const effect=factory({...options,initialParams,...extra})
    return {name,effect,update:t=>effect.update(t,ground),params:()=>effect.setParams({...initialParams}),
      damage:()=>effect.addBurnFromWorldPoint?.(point),clear:()=>effect.clearBurns?.()}
  }
  for(const appearance of ['generic','scrub','fungus']) cases.push(()=>{
    const effect=sdk.createBandFieldEffect({...options,appearance})
    return {name:`band-${appearance}`,effect,update:()=>effect.update(ground),
      params:()=>effect.setParams({...sdk.DEFAULT_BAND_FIELD_PARAMS})}
  })
  for(const appearance of ['fish','shutter','ivy','glass','glassBulb']) cases.push(()=>{
    const effect=sdk.createShellSurfaceEffect({...options,appearance})
    return {name:`shell-${appearance}`,effect,update:t=>effect.update(t),
      params:()=>effect.setParams({...sdk.DEFAULT_SHELL_SURFACE_PARAMS}),
      damage:()=>effect.addWoundFromWorldPoint(new THREE.Vector3(0,0,0),new THREE.Vector3(0,0,-1)),clear:()=>effect.clearWounds()}
  })
  cases.push(()=>field('fungus-seam',sdk.createFungusSeamEffect,sdk.DEFAULT_FUNGUS_SEAM_PARAMS))
  cases.push(()=>field('needle-litter',sdk.createNeedleLitterFieldEffect,sdk.DEFAULT_NEEDLE_LITTER_FIELD_PARAMS))
  cases.push(()=>field('leaf-pile',sdk.createLeafPileBandEffect,sdk.DEFAULT_LEAF_PILE_BAND_PARAMS))
  cases.push(()=>{
    const effect=sdk.createGrassEffect(options)
    return {name:'grass',effect,update:t=>effect.update(t),params:()=>effect.setParams({...sdk.DEFAULT_GRASS_FIELD_PARAMS}),
      damage:()=>effect.addDisturbanceFromWorldPoint(point,{strength:1}),
      clear:()=>{effect.clearDisturbances();effect.clearBurns()}}
  })
  for(const [name,factory,defaults] of [
    ['rocks',sdk.createRockFieldEffect,sdk.DEFAULT_ROCK_FIELD_PARAMS],
    ['logs',sdk.createLogFieldEffect,sdk.DEFAULT_LOG_FIELD_PARAMS],
    ['sticks',sdk.createStickFieldEffect,sdk.DEFAULT_STICK_FIELD_PARAMS],
    ['shrubs',sdk.createShrubFieldEffect,sdk.DEFAULT_SHRUB_FIELD_PARAMS],
    ['trees',sdk.createTreeFieldEffect,sdk.DEFAULT_TREE_FIELD_PARAMS],
  ]) cases.push(()=>{
    const fixture=field(name,factory,defaults)
    const effect=fixture.effect
    fixture.damage=()=>{
      if(name==='trees') effect.addCrownBurnFromWorldPoint(point,{instanceId:0})
      else if(name==='shrubs') effect.addBurnFromWorldPoint(point,{instanceId:0})
      else if(name==='rocks') {
        const mesh=effect.group.children.find(object=>object.isInstancedMesh)
        effect.destroyFromRaycastHit({object:mesh,instanceId:0,point},new THREE.Vector3(1,-1,0))
      } else effect.addMotionFromWorldPoint(point,{radiusScale:5})
    }
    fixture.clear=()=>{
      if(name==='trees')effect.clearCrownBurns()
      else if(name==='shrubs')effect.clearBurns()
      else if(name==='rocks')effect.clearDestruction()
      else effect.clearMotion()
    }
    return fixture
  })
  for(const [name,factory,defaults] of [
    ['fire',sdk.createFireWallEffect,sdk.DEFAULT_FIRE_WALL_PARAMS],
    ['stars',sdk.createStarSkyEffect,sdk.DEFAULT_STAR_SKY_PARAMS],
  ]) cases.push(()=>{
    const effect=factory(options)
    return {name,effect,update:t=>effect.update(t),params:()=>effect.setParams({...defaults}),
      damage:()=>name==='stars' ? effect.addWoundFromWorldDirection(new THREE.Vector3(1,.3,0)) : effect.addWoundFromWorldPoint(new THREE.Vector3(0,3,0)),
      clear:()=>effect.clearWounds()}
  })
  cases.push(()=>{
    const surface=sdk.createBookPageSurface('benchmark-book',('The leaves moved gently across the page. A quiet wind followed the path through the forest.\n').repeat(30))
    const effect=sdk.createBookPageEffect({...options,surface,wallWidth:12,wallHeight:8})
    return {name:'book',effect,update:t=>effect.update(t),params:()=>effect.setParams({...sdk.DEFAULT_BOOK_PAGE_PARAMS}),
      damage:()=>effect.setPlayerWorldPoint(new THREE.Vector3(0,4,.2)),
      clear:()=>effect.setPlayerWorldPoint(new THREE.Vector3(0,0,1e6))}
  })
  // All coordinated looks run their five constituent families at their actual authored densities.
  for(const [look,preset] of Object.entries(sdk.LANDSCAPE_PRESETS)) {
    for(const kind of ['grass','rocks','shrubs','trees','leafPile']) cases.push(()=>{
      const factories={grass:sdk.createGrassEffect,rocks:sdk.createRockFieldEffect,shrubs:sdk.createShrubFieldEffect,
        trees:sdk.createTreeFieldEffect,leafPile:sdk.createLeafPileBandEffect}
      const fixture=field(`${look}/${kind}`,factories[kind],preset[kind])
      if(kind==='grass') {
        fixture.update=t=>fixture.effect.update(t)
        fixture.damage=()=>fixture.effect.addDisturbanceFromWorldPoint(point,{strength:1})
        fixture.clear=()=>{fixture.effect.clearDisturbances();fixture.effect.clearBurns()}
      } else if(kind==='trees') {
        fixture.damage=()=>fixture.effect.addCrownBurnFromWorldPoint(point,{instanceId:0})
        fixture.clear=()=>fixture.effect.clearCrownBurns()
      } else if(kind==='shrubs') fixture.damage=()=>fixture.effect.addBurnFromWorldPoint(point,{instanceId:0})
      else if(kind==='rocks') {fixture.damage=undefined;fixture.clear=()=>fixture.effect.clearDestruction()}
      return fixture
    })
  }
  return cases
}

export function seeded(action,seed=17) {
  const original=Math.random
  let state=seed>>>0
  Math.random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296}
  try {return action()} finally {Math.random=original}
}

function hash(array,length=array.length) {
  const bytes=new Uint8Array(array.buffer,array.byteOffset,length*array.BYTES_PER_ELEMENT)
  let value=2166136261
  for(let i=0;i<bytes.length;i++)value=Math.imul(value^bytes[i],16777619)
  return (value>>>0).toString(16)
}
export function meshesOf(effect) {
  const meshes=[]
  effect.group.traverse(object=>{if(object.isInstancedMesh)meshes.push(object)})
  return meshes
}
export function snapshot(effect) {
  const result=[]
  effect.group.traverse(object=>{
    if(!object.isMesh)return
    const attributes={}
    for(const [name,attribute] of Object.entries(object.geometry.attributes)) {
      const length=attribute.isInstancedBufferAttribute ? Math.min(attribute.count,object.count)*attribute.itemSize : attribute.array.length
      attributes[name]=hash(attribute.array,length)
    }
    result.push({count:object.isInstancedMesh?object.count:null,attributes,
      matrix:object.isInstancedMesh?hash(object.instanceMatrix.array,object.count*16):null,
      color:object.instanceColor?hash(object.instanceColor.array,object.count*3):null,
      position:object.position.toArray(),quaternion:object.quaternion.toArray(),scale:object.scale.toArray()})
  })
  return result
}
export function uploadVersions(effect) {
  return meshesOf(effect).flatMap(mesh=>[mesh.instanceMatrix.version,mesh.instanceColor?.version??0,
    ...Object.values(mesh.geometry.attributes).filter(a=>a.isInstancedBufferAttribute).map(a=>a.version)])
}

export function inspectFixture(fixture) {
  const {effect,update}=fixture
  const states={}
  update(1);states.initial=snapshot(effect)
  update(1.05);states.idle=snapshot(effect)
  fixture.params();update(1.1);states.params=snapshot(effect)
  fixture.damage?.();update(1.15);states.damage=snapshot(effect)
  update(1.2);states.reaction=snapshot(effect)
  fixture.clear?.();update(1.25);states.clear=snapshot(effect)
  return states
}
