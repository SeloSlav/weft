import * as THREE from 'three'

const hash=array=>{
  const bytes=new Uint8Array(array.buffer,array.byteOffset,array.byteLength)
  let value=2166136261
  for(const byte of bytes)value=Math.imul(value^byte,16777619)
  return (value>>>0).toString(16)
}
const snap=effect=>{
  const meshes=[]
  effect.group.traverse(object=>{if(object.isInstancedMesh)meshes.push({count:object.count,
    matrices:hash(object.instanceMatrix.array.subarray(0,object.count*16))})})
  return meshes
}
export function runPortableFixtures(sdk) {
  const cases=[
    ['band',sdk.createBandFieldEffect,sdk.getPreparedBandSurface,'band'],
    ['fungus',sdk.createFungusSeamEffect,sdk.getPreparedFungusBandSurface],
    ['grass',sdk.createGrassEffect,()=>sdk.buildGrassStateSurface(sdk.DEFAULT_GRASS_FIELD_PARAMS.state),'grass'],
    ['leaf',sdk.createLeafPileBandEffect,()=>sdk.buildLeafPileSeasonSurface(sdk.DEFAULT_LEAF_PILE_BAND_PARAMS.season)],
    ['needle',sdk.createNeedleLitterFieldEffect,sdk.getPreparedNeedleLitterSurface],
    ['rocks',sdk.createRockFieldEffect,sdk.getPreparedRockSurface],
    ['logs',sdk.createLogFieldEffect,sdk.getPreparedLogSurface],
    ['sticks',sdk.createStickFieldEffect,sdk.getPreparedStickSurface],
    ['shrubs',sdk.createShrubFieldEffect,sdk.getPreparedShrubSurface],
    ['trees',sdk.createTreeFieldEffect,sdk.getPreparedTreeSurface],
    ['shell',sdk.createShellSurfaceEffect,sdk.getPreparedShellSurface,'animated'],
    ['fire',sdk.createFireWallEffect,sdk.getPreparedFireSurface,'animated'],
    ['stars',sdk.createStarSkyEffect,sdk.getPreparedStarSurface,'animated'],
  ]
  const ground=()=>0, result={}
  const point=new THREE.Vector3(0,0,0)
  for(const [name,factory,prepare,kind] of cases){
    const surface=sdk.makeSurfacePortable(prepare())
    const effect=factory({surface,seedCursor:sdk.seedCursor})
    const update=t=>kind==='band' ? effect.update(ground) :
      kind==='grass'||kind==='animated' ? effect.update(t) : effect.update(t,ground)
    update(0)
    const initial=snap(effect)
    if(name==='grass')effect.addDisturbanceFromWorldPoint(point,{strength:1})
    else if(name==='fungus'||name==='leaf'||name==='needle')effect.addBurnFromWorldPoint(point)
    else if(name==='shrubs')effect.addBurnFromWorldPoint(point,{instanceId:0})
    else if(name==='trees')effect.addCrownBurnFromWorldPoint(point,{instanceId:0})
    else if(name==='logs'||name==='sticks')effect.addMotionFromWorldPoint(point,{radiusScale:5})
    else if(name==='shell')effect.addWoundFromWorldPoint(point,new THREE.Vector3(0,0,-1))
    else if(name==='fire')effect.addWoundFromWorldPoint(new THREE.Vector3(0,3,0))
    else if(name==='stars')effect.addWoundFromWorldDirection(new THREE.Vector3(1,.3,0))
    update(.05);update(.1)
    result[name]={initial,active:snap(effect)}
    effect.dispose()
  }
  const bookTokens=[...Array.from('The portable page has fixed glyph placement.\nA second line with '),'👩‍👩‍👧‍👦','.']
  const bookSurface=sdk.createPortableBookPageSurface('portable-book',bookTokens)
  const book=sdk.createBookPageEffect({surface:bookSurface,seedCursor:sdk.seedCursor,wallWidth:12,wallHeight:8})
  book.update(0);const initial=snap(book)
  book.setPlayerWorldPoint(new THREE.Vector3(0,4,.2));book.update(.05)
  result.book={initial,active:snap(book)};book.dispose()
  return result
}
