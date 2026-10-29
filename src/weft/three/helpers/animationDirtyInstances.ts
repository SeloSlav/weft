import type { BufferAttribute } from 'three'

// A bounded per-attribute journal survives renderer update-range clearing. Only
// producers that know every modified instance may publish a hint; a missing
// version always forces consumers back to a complete comparison.
const history = new WeakMap<BufferAttribute, Array<{version:number; blocks:Uint8Array; instances:number}>>()
const HISTORY_LIMIT = 16
export const DIRTY_INSTANCE_BLOCK = 32

export function recordAnimationDirtyInstances(attribute:BufferAttribute, previousVersion:number,
  blocks:Uint8Array, instances:number):void {
  if(attribute.version!==previousVersion+1)return
  let entries=history.get(attribute)
  if(!entries){entries=[];history.set(attribute,entries)}
  entries.push({version:attribute.version,blocks,instances})
  if(entries.length>HISTORY_LIMIT)entries.splice(0,entries.length-HISTORY_LIMIT)
}

export function animationDirtyInstances(attribute:BufferAttribute, from:number, to:number,
  instances:number):readonly Uint8Array[] | null {
  const entries=history.get(attribute)
  if(!entries || to<=from || !Number.isSafeInteger(from) || !Number.isSafeInteger(to) || to-from>HISTORY_LIMIT)return null
  const found:Uint8Array[]=[]
  for(let version=from+1;version<=to;version++){
    const entry=entries.find(value=>value.version===version)
    if(!entry || entry.instances!==instances)return null
    found.push(entry.blocks)
  }
  return found
}
