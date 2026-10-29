// Frozen pre-optimization delta implementation used only for paired CPU benchmarks.
// Do not update this when changing the production codec; the report records its SHA-256.
import { applySurfaceAnimationBinary } from '../../src/weft/three/surfaceAnimationBinary'
import type { SurfaceAnimationTarget } from '../../src/weft/three/surfaceAnimationFrame'

// Animation deltas operate on the already-versioned WFA1 binary format.
// They carry the new header and changed 32-bit runs per attribute block.
const FULL = [0x57,0x46,0x41,0x31] as const
const DELTA = [0x57,0x46,0x44,0x31] as const
const FIXED_HEADER = 84
const DEFAULT_MAX_FRAME_BYTES = 256 * 1024 * 1024
const NATIVE_LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1
const decoder = new TextDecoder('utf-8', { fatal: true })
type Block = { offset: number; length: number }
type Layout = { prefix: number; blocks: Block[] }
type Run = { block: number; offset: number; length: number }

function hasMagic(bytes: Uint8Array, magic: readonly number[]): boolean {
  return bytes.length >= 4 && magic.every((value,index)=>bytes[index]===value)
}
function assertBytes(bytes: Uint8Array): void {
  if (!(bytes instanceof Uint8Array) || (typeof SharedArrayBuffer !== 'undefined' && bytes.buffer instanceof SharedArrayBuffer)) {
    throw new TypeError('Animation packets must be Uint8Array data outside shared memory')
  }
}
function layout(bytes: Uint8Array): Layout {
  assertBytes(bytes)
  if (!hasMagic(bytes,FULL) || bytes.length<8) throw new TypeError('Expected a WFA1 animation frame')
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength)
  const headerLength=view.getUint32(4,true)
  const prefix=8+Math.ceil(headerLength/4)*4
  if(prefix>bytes.length)throw new RangeError('Truncated animation frame header')
  for(let i=8+headerLength;i<prefix;i++)if(bytes[i]!==0)throw new Error('Invalid animation frame padding')
  const frame=JSON.parse(decoder.decode(bytes.subarray(8,8+headerLength)))
  if(!frame || !frame.transform || !Array.isArray(frame.transform.nodes) || !Array.isArray(frame.nodes)) throw new TypeError('Invalid animation frame schema')
  const blocks:Block[]=[]
  let offset=prefix
  function add(marker:unknown):void {
    if(!marker || typeof marker!=='object' || !('$weftWords' in marker)) throw new Error('Missing animation word block')
    const m=marker as {$weftWords:unknown;length?:unknown}
    if(Object.keys(m).length!==2 || m.$weftWords!==blocks.length || !Number.isSafeInteger(m.length) || (m.length as number)<0) throw new Error('Invalid animation word block')
    const length=(m.length as number)*4, end=offset+length
    if(!Number.isSafeInteger(end) || end>bytes.length)throw new RangeError('Truncated animation word block')
    blocks.push({offset,length});offset=end
  }
  for(const node of frame.transform.nodes)if(node?.instances)add(node.instances.matrixBits)
  for(const node of frame.nodes){
    if(node===null)continue
    if(!node || !Array.isArray(node.attributes))throw new TypeError('Invalid animation node')
    for(const attribute of node.attributes){if(!attribute)throw new TypeError('Invalid animation attribute');add(attribute.words)}
    if(node.instanceColor!==null)add(node.instanceColor)
  }
  if(offset!==bytes.length)throw new Error('Animation frame has trailing data')
  return {prefix,blocks}
}
function wordView(bytes:Uint8Array, block:Block): Uint32Array | null {
  const offset=bytes.byteOffset+block.offset
  return offset%4===0 ? new Uint32Array(bytes.buffer,offset,block.length/4) : null
}
function changedRuns(previous:Uint8Array, next:Uint8Array, before:Layout, after:Layout): {runs:Run[];size:number} {
  const runs:Run[]=[]
  let size=FIXED_HEADER+after.prefix
  for(let k=0;k<after.blocks.length;k++){
    const current=after.blocks[k]!,old=before.blocks[k]
    const n=current.length/4, oldN=(old?.length ?? 0)/4
    const a=wordView(next,current), b=old ? wordView(previous,old) : null
    const av=new DataView(next.buffer,next.byteOffset+current.offset,current.length)
    const bv=old ? new DataView(previous.buffer,previous.byteOffset+old.offset,old.length) : null
    const differs=(i:number)=>i>=oldN || (a ? a[i] : av.getUint32(i*4,NATIVE_LITTLE_ENDIAN)) !== (b ? b[i] : bv!.getUint32(i*4,NATIVE_LITTLE_ENDIAN))
    let i=0
    while(i<n){
      while(i<n && !differs(i))i++
      if(i===n)break
      const start=i;let last=i; i++
      while(i<n && i-last<=4){if(differs(i))last=i;i++}
      const length=(last-start+1)*4
      runs.push({block:k,offset:start*4,length})
      size+=12+length
      if(size>=next.length)return {runs,size}
      i=last+1
    }
  }
  return {runs,size}
}
async function digest(bytes:Uint8Array):Promise<Uint8Array> {
  if(!globalThis.crypto?.subtle)throw new Error('Animation deltas require Web Crypto SHA-256 in a secure context')
  return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes as Uint8Array<ArrayBuffer>))
}
function equalHash(a:Uint8Array,b:Uint8Array):boolean {
  if(a.length!==b.length)return false
  let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]!^b[i]!
  return diff===0
}

/** Encode a delta or return a copied WFA1 keyframe when the delta is not smaller. */
export async function encodeSurfaceAnimationDelta(previous:Uint8Array, current:Uint8Array):Promise<Uint8Array> {
  const before=layout(previous),after=layout(current)
  if(previous.length>0xffffffff || current.length>0xffffffff)throw new RangeError('Animation frame is too large for delta encoding')
  const {runs,size}=changedRuns(previous,current,before,after)
  if(size>=current.length)return new Uint8Array(current)
  const packet=new Uint8Array(size),view=new DataView(packet.buffer)
  packet.set(DELTA);view.setUint32(4,previous.length,true);view.setUint32(8,current.length,true)
  view.setUint32(12,after.prefix,true);view.setUint32(16,runs.length,true)
  packet.set(current.subarray(0,after.prefix),FIXED_HEADER)
  let pos=FIXED_HEADER+after.prefix
  for(const run of runs){
    view.setUint32(pos,run.block,true);view.setUint32(pos+4,run.offset,true);view.setUint32(pos+8,run.length,true);pos+=12
    const block=after.blocks[run.block]!
    packet.set(current.subarray(block.offset+run.offset,block.offset+run.offset+run.length),pos);pos+=run.length
  }
  // digest() snapshots its input before yielding; packet data has already been copied.
  const [baseHash,resultHash]=await Promise.all([digest(previous),digest(current)])
  packet.set(baseHash,20);packet.set(resultHash,52)
  return packet
}

export type SurfaceAnimationDeltaOptions = { maxFrameBytes?: number }
/** Rebuild a WFA1 frame; rejects mismatched baselines, malformed packets and digest failures. */
export async function decodeSurfaceAnimationDelta(previous:Uint8Array | null, packet:Uint8Array,
  options:SurfaceAnimationDeltaOptions = {}):Promise<Uint8Array> {
  assertBytes(packet)
  const limit=options.maxFrameBytes ?? DEFAULT_MAX_FRAME_BYTES
  if(!Number.isSafeInteger(limit) || limit<0)throw new RangeError('maxFrameBytes must be a non-negative safe integer')
  if(hasMagic(packet,FULL)){
    if(packet.length>limit)throw new RangeError('Animation frame exceeds maxFrameBytes')
    const full=new Uint8Array(packet);layout(full);return full
  }
  if(!hasMagic(packet,DELTA) || packet.length<FIXED_HEADER)throw new TypeError('Invalid animation delta packet')
  if(!previous)throw new Error('Animation delta requires its previous frame')
  assertBytes(previous)
  if(previous.length>limit || packet.length>limit)throw new RangeError('Animation frame exceeds maxFrameBytes')
  // Async hashing must not observe changes made by the caller while awaiting.
  const base=new Uint8Array(previous),data=new Uint8Array(packet), view=new DataView(data.buffer,data.byteOffset,data.byteLength)
  const baseLength=view.getUint32(4,true),nextLength=view.getUint32(8,true),prefix=view.getUint32(12,true),count=view.getUint32(16,true)
  if(base.length!==baseLength)throw new Error('Animation delta baseline length differs')
  if(nextLength>limit)throw new RangeError('Animation frame exceeds maxFrameBytes')
  if(prefix<8 || prefix>nextLength || FIXED_HEADER+prefix>data.length || count>Math.floor((data.length-FIXED_HEADER-prefix)/12)) throw new RangeError('Invalid animation delta lengths')
  const before=layout(base)
  if(!equalHash(await digest(base),data.subarray(20,52)))throw new Error('Animation delta baseline hash differs')
  const result=new Uint8Array(nextLength)
  result.set(data.subarray(FIXED_HEADER,FIXED_HEADER+prefix))
  const after=layout(result)
  if(after.prefix!==prefix)throw new Error('Animation delta prefix differs')
  for(let i=0;i<after.blocks.length;i++){
    const old=before.blocks[i],next=after.blocks[i]!
    if(old)result.set(base.subarray(old.offset,old.offset+Math.min(old.length,next.length)),next.offset)
  }
  let pos=FIXED_HEADER+prefix,lastBlock=-1,lastEnd=0
  for(let i=0;i<count;i++){
    if(pos+12>data.length)throw new RangeError('Truncated animation delta record')
    const index=view.getUint32(pos,true),offset=view.getUint32(pos+4,true),length=view.getUint32(pos+8,true);pos+=12
    const block=after.blocks[index]
    if(!block || !length || offset%4 || length%4 || offset+length>block.length || pos+length>data.length ||
      index<lastBlock || (index===lastBlock && offset<lastEnd)) throw new Error('Invalid animation delta record')
    result.set(data.subarray(pos,pos+length),block.offset+offset);pos+=length;lastBlock=index;lastEnd=offset+length
  }
  if(pos!==data.length)throw new Error('Animation delta has trailing data')
  if(!equalHash(await digest(result),data.subarray(52,84)))throw new Error('Animation delta result hash differs')
  return result
}

/** Apply a verified packet and return its WFA1 bytes for use as the next baseline. */
export async function applySurfaceAnimationDelta(target:SurfaceAnimationTarget, previous:Uint8Array | null,
  packet:Uint8Array, options:SurfaceAnimationDeltaOptions = {}):Promise<Uint8Array> {
  const frame=await decodeSurfaceAnimationDelta(previous,packet,options)
  applySurfaceAnimationBinary(target,frame)
  return frame
}

