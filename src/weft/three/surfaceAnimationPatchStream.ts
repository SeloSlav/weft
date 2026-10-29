import * as THREE from 'three'
import { captureSurfaceAnimationBinary, applySurfaceAnimationBinary } from './surfaceAnimationBinary'
import { readUniforms, type SurfaceAnimationTarget, type UniformFrame } from './surfaceAnimationFrame'
import { nodesOf } from './surfaceTransformFrame'
import { trackInstanceUploads, updateAttributeSpan } from './helpers/bufferUpdates'
import { animationDirtyInstances, DIRTY_INSTANCE_BLOCK } from './helpers/animationDirtyInstances'
import { assertBytes, digest, equal, tickOf, sameSchema, decodeUniforms, SurfaceAnimationKeyframeRequiredError } from './surfaceAnimationUniformStream'

const MAGIC=[87,80,83,49] as const // WPS1
const SPARSE_MAGIC=[87,80,83,50] as const // WPS2
const XOR_MAGIC=[87,80,83,51] as const // WPS3
const HEADER=80, HASH=32, MAX_PACKET=256*1024*1024, CHUNK=512
const textEncoder=new TextEncoder(), textDecoder=new TextDecoder('utf-8',{fatal:true})
const littleEndian=new Uint8Array(new Uint32Array([1]).buffer)[0]===1

type Tracked={attribute:THREE.BufferAttribute; words:Uint32Array; snapshot?:Uint32Array; version:number; mesh:THREE.Mesh; matrix:boolean}
type State={shape:unknown[]; buffers:Tracked[]; aliases:number[]}
// WPS1 carries whole word blocks. WPS2 carries one changed-bit mask per
// 32 words followed by absolute changed words. WPS3 adds two-bit XOR-byte
// lengths for each word, followed by little-endian XOR bytes and zero padding.
// Each format shares the same stream/revision header and checksum.
type Run={index:number; start:number; length:number}
type SparseRun=Run & { masks:Uint32Array; codes:Uint32Array; changed:number; xorBytes:number }
function stateOf(target:SurfaceAnimationTarget, copy:boolean):State {
  const shape:unknown[]=[], buffers:Tracked[]=[], aliases:number[]=[], seen=new Map<THREE.BufferAttribute,number>(), arrays=new Map<ArrayLike<number>,THREE.BufferAttribute>()
  const add=(attribute:THREE.BufferAttribute, length:number, mesh:THREE.Mesh, matrix=false)=>{
    if(!(attribute.array instanceof Float32Array) || length>attribute.array.length || length<0)throw new SurfaceAnimationKeyframeRequiredError('Patch streams require compatible Float32 attributes')
    shape.push(attribute,attribute.array,attribute.itemSize,attribute.normalized,length)
    const previous=seen.get(attribute)
    if(previous!==undefined){
      aliases.push(previous)
      if(buffers[previous]!.words.length!==length)throw new SurfaceAnimationKeyframeRequiredError('Shared attribute lengths differ')
      return
    }
    const arrayOwner=arrays.get(attribute.array)
    if(arrayOwner && arrayOwner!==attribute)throw new SurfaceAnimationKeyframeRequiredError('Shared arrays with distinct attributes are unsupported')
    arrays.set(attribute.array,attribute);aliases.push(buffers.length);seen.set(attribute,buffers.length)
    const words=new Uint32Array(attribute.array.buffer,attribute.array.byteOffset,length)
    buffers.push({attribute,words,snapshot:copy?words.slice():undefined,version:attribute.version,mesh,matrix})
  }
  for(const node of nodesOf(target.group)){
    shape.push(node,node.type,node.name,node.visible,node.children.length,node.matrixAutoUpdate,
      ...node.matrix.elements,...node.position.toArray(),...node.quaternion.toArray(),...node.scale.toArray())
    const mesh=node as THREE.Mesh
    if(!mesh.isMesh)continue
    const geometry=mesh.geometry, inst=mesh as THREE.InstancedMesh
    if(!geometry?.isBufferGeometry || (mesh as THREE.SkinnedMesh).isSkinnedMesh || Object.values(geometry.morphAttributes).some(a=>a.length))throw new SurfaceAnimationKeyframeRequiredError('Unsupported patch stream geometry')
    shape.push(geometry,geometry.index,geometry.index?.array,geometry.index?.version)
    if(inst.isInstancedMesh){
      shape.push(inst.count,inst.instanceColor)
      add(inst.instanceMatrix,inst.count*16,mesh,true)
      if(inst.instanceColor)add(inst.instanceColor,inst.count*3,mesh)
    }
    const names=Object.keys(geometry.attributes).sort();shape.push(names.length)
    for(const name of names){
      const a=geometry.attributes[name]!
      if((a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute)throw new SurfaceAnimationKeyframeRequiredError('Interleaved attributes are unsupported')
      const attr=a as THREE.InstancedBufferAttribute, isInstanced=Boolean(attr.isInstancedBufferAttribute), divisor=isInstanced?attr.meshPerAttribute:1
      if(!Number.isSafeInteger(divisor)||divisor<=0 || (isInstanced&&!inst.isInstancedMesh))throw new SurfaceAnimationKeyframeRequiredError('Invalid instanced attribute')
      shape.push(name,isInstanced,divisor)
      add(attr,isInstanced?Math.ceil(inst.count/divisor)*attr.itemSize:attr.array.length,mesh)
    }
  }
  return {shape,buffers,aliases}
}
function sameShape(a:State,b:State):boolean {return a.shape.length===b.shape.length && a.shape.every((v,i)=>Object.is(v,b.shape[i]))}
function stable(a:State,b:State):boolean {return sameShape(a,b) && a.buffers.every((v,i)=>v.version===b.buffers[i]!.version)}
async function bindingHash(keyframe:Uint8Array,state:State):Promise<Uint8Array>{
  const frameHash=await digest(keyframe),signature=textEncoder.encode(JSON.stringify(state.aliases)),data=new Uint8Array(frameHash.length+signature.length)
  data.set(frameHash);data.set(signature,frameHash.length);return digest(data)
}
function requireShape(a:State,b:State):void {if(!sameShape(a,b))throw new SurfaceAnimationKeyframeRequiredError('Patch stream layout or transform changed')}
function writeWords(packet:Uint8Array,pos:number,words:Uint32Array,start:number,length:number):void {
  if(littleEndian)packet.set(new Uint8Array(words.buffer,words.byteOffset+start*4,length*4),pos)
  else {const view=new DataView(packet.buffer);for(let i=0;i<length;i++)view.setUint32(pos+i*4,words[start+i]!,true)}
}
function readWords(packet:Uint8Array,pos:number,length:number):Uint32Array {
  if(littleEndian && (packet.byteOffset+pos)%4===0)return new Uint32Array(packet.buffer,packet.byteOffset+pos,length)
  const words=new Uint32Array(length),view=new DataView(packet.buffer,packet.byteOffset+pos,length*4)
  for(let i=0;i<length;i++)words[i]=view.getUint32(i*4,true)
  return words
}

/** Stateful stream for uniforms and marked Float32 buffer changes. */
export class SurfaceAnimationPatchEncoder {
  private sequence=0; private revision=0; private busy=false
  private target:SurfaceAnimationTarget; private hash:Uint8Array; private id:Uint8Array
  private state:State; private schema:UniformFrame[]; private tick:number
  constructor(target:SurfaceAnimationTarget,hash:Uint8Array,id:Uint8Array,state:State,schema:UniformFrame[],tick:number){
    this.target=target;this.hash=hash;this.id=id;this.state=state;this.schema=schema;this.tick=tick
  }
  async capture(tick:number):Promise<Uint8Array>{
    if(this.busy)throw new Error('Patch stream capture is already in progress')
    if(!Number.isSafeInteger(tick)||tick<=this.tick)throw new RangeError('Patch stream ticks must increase')
    if(this.sequence===0xffffffff || this.revision===0xffffffff)throw new SurfaceAnimationKeyframeRequiredError('Patch stream revision exhausted')
    const current=stateOf(this.target,false);requireShape(this.state,current)
    const uniforms=readUniforms(this.target)
    if(!sameSchema(this.schema,uniforms))throw new SurfaceAnimationKeyframeRequiredError('Animation uniform schema changed')
    if(!stable(current,stateOf(this.target,false)))throw new SurfaceAnimationKeyframeRequiredError('Render state changed during capture')
    const runs:SparseRun[]=[]
    for(let k=0;k<current.buffers.length;k++){
      const buffer=current.buffers[k]!,old=this.state.buffers[k]!
      if(buffer.version===old.version)continue
      const a=buffer.words,b=old.snapshot!,itemSize=buffer.attribute.itemSize
      const hints=animationDirtyInstances(buffer.attribute,old.version,buffer.version,a.length/itemSize)
      for(let start=0;start<a.length;start+=CHUNK){
        const end=Math.min(start+CHUNK,a.length)
        if(hints){
          const first=Math.floor(start/itemSize/DIRTY_INSTANCE_BLOCK),last=Math.floor((end-1)/itemSize/DIRTY_INSTANCE_BLOCK)
          let relevant=false
          for(const blocks of hints){for(let i=first;i<=last;i++)if(blocks[i]){relevant=true;break}if(relevant)break}
          if(!relevant)continue
        }
        let i=start
        while(i+8<=end && a[i]===b[i] && a[i+1]===b[i+1] && a[i+2]===b[i+2] && a[i+3]===b[i+3] &&
          a[i+4]===b[i+4] && a[i+5]===b[i+5] && a[i+6]===b[i+6] && a[i+7]===b[i+7])i+=8
        while(i<end && a[i]===b[i])i++
        if(i===end)continue
        const masks=new Uint32Array(Math.ceil((end-start)/32)),codes=new Uint32Array(masks.length*2);let changed=0,xorBytes=0
        for(let base=start;base<end;base+=32){
          let mask=0;const stop=Math.min(base+32,end)
          for(let j=base;j<stop;j++)if(a[j]!==b[j]){
            const bit=j-base,xor=(a[j]!^b[j]!)>>>0,bytes=Math.ceil((32-Math.clz32(xor))/8)
            mask|=1<<bit;changed++;xorBytes+=bytes
            codes[((base-start)>>>5)*2+(bit>>>4)]! |= (bytes-1)<<((bit&15)*2)
          }
          masks[(base-start)>>>5]=mask>>>0
        }
        runs.push({index:k,start,length:end-start,masks,codes,changed,xorBytes})
      }
    }
    const uniformBytes=textEncoder.encode(JSON.stringify(uniforms))
    // Pad JSON so every word block remains aligned.
    const padded=(uniformBytes.length+3)&~3
    let sparseSize=HEADER+padded+HASH,xorSize=sparseSize,fullSize=sparseSize
    for(const run of runs){
      sparseSize+=16+run.masks.length*4+run.changed*4
      xorSize+=16+run.masks.length*12+Math.ceil(run.xorBytes/4)*4
      fullSize+=12+run.length*4
    }
    const useFull=fullSize<=sparseSize && fullSize<=xorSize
    const useXor=!useFull && xorSize<sparseSize,size=useFull?fullSize:useXor?xorSize:sparseSize
    if(size>MAX_PACKET)throw new SurfaceAnimationKeyframeRequiredError('Patch packet exceeds limit')
    const packet=new Uint8Array(size),view=new DataView(packet.buffer)
    packet.set(useFull?MAGIC:useXor?XOR_MAGIC:SPARSE_MAGIC);view.setUint32(4,this.sequence+1,true);view.setFloat64(8,tick,true)
    packet.set(this.hash,16);packet.set(this.id,48)
    view.setUint32(64,this.revision,true);view.setUint32(68,this.revision+(runs.length?1:0),true)
    view.setUint32(72,uniformBytes.length,true);view.setUint32(76,runs.length,true);packet.set(uniformBytes,HEADER)
    let pos=HEADER+padded
    for(const run of runs){
      view.setUint32(pos,run.index,true);view.setUint32(pos+4,run.start,true);view.setUint32(pos+8,run.length,true)
      if(useFull){pos+=12;writeWords(packet,pos,current.buffers[run.index]!.words,run.start,run.length);pos+=run.length*4;continue}
      view.setUint32(pos+12,useXor?run.xorBytes:run.changed,true);pos+=16
      writeWords(packet,pos,run.masks,0,run.masks.length);pos+=run.masks.length*4
      if(useXor){writeWords(packet,pos,run.codes,0,run.codes.length);pos+=run.codes.length*4}
      const words=current.buffers[run.index]!.words,previous=this.state.buffers[run.index]!.snapshot!
      for(let m=0;m<run.masks.length;m++){
        let mask=run.masks[m]!
        while(mask){
          const bit=31-Math.clz32(mask & -mask),index=run.start+m*32+bit
          if(useXor){
            const value=(words[index]!^previous[index]!)>>>0,bytes=1+((run.codes[m*2+(bit>>>4)]!>>>((bit&15)*2))&3)
            packet[pos++]=value&255
            if(bytes>1)packet[pos++]=(value>>>8)&255
            if(bytes>2)packet[pos++]=(value>>>16)&255
            if(bytes>3)packet[pos++]=value>>>24
          }else {view.setUint32(pos,words[index]!,true);pos+=4}
          mask=(mask & (mask-1))>>>0
        }
      }
      if(useXor)pos=(pos+3)&~3
    }
    this.busy=true
    try{
      packet.set(await digest(packet.subarray(0,size-HASH)),size-HASH)
      pos=HEADER+padded
      for(const run of runs){
        const snapshot=this.state.buffers[run.index]!.snapshot!
        if(useFull){pos+=12;snapshot.set(readWords(packet,pos,run.length),run.start);pos+=run.length*4;continue}
        pos+=16+run.masks.length*(useXor?12:4)
        for(let m=0;m<run.masks.length;m++){
          let mask=run.masks[m]!
          while(mask){
            const bit=31-Math.clz32(mask & -mask),index=run.start+m*32+bit
            if(useXor){
              const bytes=1+((run.codes[m*2+(bit>>>4)]!>>>((bit&15)*2))&3);let value=0
              value=packet[pos++]!
              if(bytes>1)value|=packet[pos++]!<<8
              if(bytes>2)value|=packet[pos++]!<<16
              if(bytes>3)value|=packet[pos++]!<<24
              snapshot[index]=(snapshot[index]!^value)>>>0
            }else {snapshot[index]=view.getUint32(pos,true);pos+=4}
            mask=(mask & (mask-1))>>>0
          }
        }
        if(useXor)pos=(pos+3)&~3
      }
      for(let i=0;i<current.buffers.length;i++)this.state.buffers[i]!.version=current.buffers[i]!.version
      this.sequence++;this.revision+=runs.length?1:0;this.tick=tick
      return packet
    }finally{this.busy=false}
  }
}

/** Receives ordered buffer patches; missing buffer revisions require a new keyframe. */
export class SurfaceAnimationPatchDecoder {
  private sequence=0; private revision=0; private busy=false
  private target:SurfaceAnimationTarget; private hash:Uint8Array; private id:Uint8Array
  private state:State; private schema:UniformFrame[]; private tick:number
  constructor(target:SurfaceAnimationTarget,hash:Uint8Array,id:Uint8Array,state:State,schema:UniformFrame[],tick:number){
    this.target=target;this.hash=hash;this.id=id;this.state=state;this.schema=schema;this.tick=tick
  }
  async apply(input:Uint8Array):Promise<number>{
    if(this.busy)throw new Error('Patch stream apply is already in progress')
    assertBytes(input)
    const xor=XOR_MAGIC.every((v,i)=>input[i]===v),sparse=xor || SPARSE_MAGIC.every((v,i)=>input[i]===v)
    if(input.length<HEADER+HASH || input.length>MAX_PACKET || (!sparse && MAGIC.some((v,i)=>input[i]!==v)))throw new TypeError('Invalid patch stream packet')
    const packet=new Uint8Array(input),view=new DataView(packet.buffer), sequence=view.getUint32(4,true),tick=view.getFloat64(8,true)
    const base=view.getUint32(64,true),next=view.getUint32(68,true),length=view.getUint32(72,true),count=view.getUint32(76,true)
    if(!sequence||sequence<=this.sequence||!Number.isSafeInteger(tick)||tick<=this.tick)throw new Error('Stale or invalid patch packet')
    if(!equal(packet.subarray(16,48),this.hash)||!equal(packet.subarray(48,64),this.id))throw new Error('Patch stream keyframe or identity differs')
    if(base!==this.revision)throw new SurfaceAnimationKeyframeRequiredError('Patch stream missed a buffer revision')
    if(next!==base+(count?1:0))throw new Error('Invalid patch revision')
    const padded=Math.ceil(length/4)*4
    if(HEADER+padded+HASH>packet.length || count>Math.floor((packet.length-HEADER-padded-HASH)/12))throw new RangeError('Invalid patch lengths')
    for(let i=HEADER+length;i<HEADER+padded;i++)if(packet[i]!==0)throw new Error('Invalid patch padding')
    const values=decodeUniforms(JSON.parse(textDecoder.decode(packet.subarray(HEADER,HEADER+length))),this.schema)
    if(!this.target.setAnimationUniforms)throw new Error('Patch stream target cannot apply uniforms')
    const runs:Array<Run & {pos:number; maskPos:number; codePos:number}>=[];let pos=HEADER+padded,lastIndex=-1,lastEnd=0
    for(let i=0;i<count;i++){
      if(pos+(sparse?16:12)>packet.length-HASH)throw new RangeError('Truncated patch record')
      const index=view.getUint32(pos,true),start=view.getUint32(pos+4,true),n=view.getUint32(pos+8,true)
      const amount=sparse?view.getUint32(pos+12,true):n;pos+=sparse?16:12
      const buffer=this.state.buffers[index],maskPos=pos,maskWords=sparse?Math.ceil(n/32):0,codePos=pos+maskWords*4
      if(!buffer || !n || start+n>buffer.words.length || index<lastIndex || (index===lastIndex && start<lastEnd) || (!xor && amount>n))throw new Error('Invalid patch record')
      const dataStart=pos+maskWords*(xor?12:4),dataBytes=xor?amount:amount*4,dataEnd=dataStart+dataBytes,paddedEnd=xor?Math.ceil(dataEnd/4)*4:dataEnd
      if(paddedEnd>packet.length-HASH)throw new Error('Invalid patch record length')
      if(sparse){
        let bits=0,bytes=0
        for(let m=0;m<maskWords;m++){
          let mask=view.getUint32(maskPos+m*4,true)
          if(m===maskWords-1 && n%32 && (mask >>> (n%32))!==0)throw new Error('Invalid patch mask')
          while(mask){
            const bit=31-Math.clz32(mask & -mask);bits++
            if(xor)bytes+=1+((view.getUint32(codePos+(m*2+(bit>>>4))*4,true)>>>((bit&15)*2))&3)
            mask=(mask & (mask-1))>>>0
          }
        }
        if(!bits || (xor?bytes!==amount:bits!==amount))throw new Error('Invalid patch mask count')
        for(let j=dataEnd;j<paddedEnd;j++)if(packet[j]!==0)throw new Error('Invalid patch record padding')
      }
      runs.push({index,start,length:n,pos:dataStart,maskPos,codePos});pos=paddedEnd;lastIndex=index;lastEnd=start+n
    }
    if(pos!==packet.length-HASH)throw new Error('Patch stream has trailing data')
    if(!stable(this.state,stateOf(this.target,false)))throw new SurfaceAnimationKeyframeRequiredError('Replica render state changed')
    this.busy=true
    try{
      if(!equal(await digest(packet.subarray(0,pos)),packet.subarray(pos)))throw new Error('Patch stream checksum differs')
      if(!stable(this.state,stateOf(this.target,false)))throw new SurfaceAnimationKeyframeRequiredError('Replica render state changed')
      this.target.validateAnimationUniforms?.(values)
      let index=-1,first=0,end=0
      const flush=()=>{
        if(index<0)return
        const buffer=this.state.buffers[index]!,size=buffer.attribute.itemSize
        if((buffer.mesh as THREE.InstancedMesh).isInstancedMesh)trackInstanceUploads(buffer.mesh as THREE.InstancedMesh)
        updateAttributeSpan(buffer.attribute,Math.floor(first/size),Math.ceil(end/size)-Math.floor(first/size))
        if(buffer.matrix){(buffer.mesh as THREE.InstancedMesh).boundingBox=null;(buffer.mesh as THREE.InstancedMesh).boundingSphere=null}
        else {buffer.mesh.geometry.boundingBox=null;buffer.mesh.geometry.boundingSphere=null}
        buffer.version=buffer.attribute.version
      }
      for(const run of runs){
        if(run.index!==index){flush();index=run.index;first=run.start;end=run.start+run.length}else end=run.start+run.length
        const words=this.state.buffers[index]!.words
        if(!sparse)words.set(readWords(packet,run.pos,run.length),run.start)
        else {
          let source=run.pos
          for(let m=0;m<Math.ceil(run.length/32);m++){
            let mask=view.getUint32(run.maskPos+m*4,true)
            while(mask){
              const bit=31-Math.clz32(mask & -mask),index=run.start+m*32+bit
              if(xor){
                const bytes=1+((view.getUint32(run.codePos+(m*2+(bit>>>4))*4,true)>>>((bit&15)*2))&3);let value=0
                value=packet[source++]!
                if(bytes>1)value|=packet[source++]!<<8
                if(bytes>2)value|=packet[source++]!<<16
                if(bytes>3)value|=packet[source++]!<<24
                words[index]=(words[index]!^value)>>>0
              }else {words[index]=view.getUint32(source,true);source+=4}
              mask=(mask & (mask-1))>>>0
            }
          }
        }
      }
      flush();this.target.setAnimationUniforms(values);this.sequence=sequence;this.revision=next;this.tick=tick
      return tick
    }finally{this.busy=false}
  }
}

/** Capture a keyframe; deliver and acknowledge it before sending patches. */
export async function createSurfaceAnimationPatchEncoder(target:SurfaceAnimationTarget,tick:number):Promise<{keyframe:Uint8Array;streamId:Uint8Array;encoder:SurfaceAnimationPatchEncoder}>{
  if(!target.getAnimationUniforms || !globalThis.crypto?.getRandomValues)throw new Error('Patch streams require animation uniforms and Web Crypto')
  const streamId=crypto.getRandomValues(new Uint8Array(16)),keyframe=captureSurfaceAnimationBinary(target,tick),state=stateOf(target,true),schema=readUniforms(target)
  const hash=await bindingHash(keyframe,state)
  return {keyframe,streamId,encoder:new SurfaceAnimationPatchEncoder(target,hash,new Uint8Array(streamId),state,schema,tick)}
}
/** Apply the initial keyframe to a replica and bind the decoder to that stream. */
export async function createSurfaceAnimationPatchDecoder(target:SurfaceAnimationTarget,keyframe:Uint8Array,streamId:Uint8Array,options:{maxFrameBytes?:number}={}):Promise<SurfaceAnimationPatchDecoder>{
  assertBytes(keyframe);assertBytes(streamId)
  if(streamId.length!==16)throw new RangeError('Patch stream identity must be 16 bytes')
  const limit=options.maxFrameBytes??MAX_PACKET
  if(!Number.isSafeInteger(limit)||limit<0||keyframe.length>limit)throw new RangeError('Patch stream keyframe exceeds maxFrameBytes')
  if(!target.getAnimationUniforms||!target.setAnimationUniforms)throw new Error('Patch stream target must expose and apply uniforms')
  const owned=new Uint8Array(keyframe),id=new Uint8Array(streamId),tick=tickOf(owned)
  applySurfaceAnimationBinary(target,owned)
  const state=stateOf(target,false),schema=readUniforms(target),hash=await bindingHash(owned,state)
  return new SurfaceAnimationPatchDecoder(target,hash,id,state,schema,tick)
}
