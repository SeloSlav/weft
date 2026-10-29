import { applySurfaceAnimationFrame, captureSurfaceAnimationFrameWords,
  type SurfaceAnimationFrame, type SurfaceAnimationTarget } from './surfaceAnimationFrame'

// WFA1: 4-byte magic, little-endian u32 header length, UTF-8 JSON schema,
// zero padding to a four-byte boundary, then little-endian uint32 word blocks.
const MAGIC = [0x57, 0x46, 0x41, 0x31] as const
const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([0x01020304]).buffer)[0] === 4
const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })

/** Capture a self-contained binary animation frame with compact 32-bit data blocks. */
export function captureSurfaceAnimationBinary(target: SurfaceAnimationTarget, tick: number): Uint8Array {
  const frame = captureSurfaceAnimationFrameWords(target, tick, false)
  const chunks: Uint32Array[] = []
  const headerText = JSON.stringify(frame, (_key, value: unknown) => {
    if (!(value instanceof Uint32Array)) return value
    const index = chunks.length
    chunks.push(value)
    return { $weftWords: index, length: value.length }
  })
  const header = encoder.encode(headerText)
  if (header.length > 0xffffffff) throw new RangeError('Animation frame header is too large')
  const dataStart = 8 + Math.ceil(header.length / 4) * 4
  const size = chunks.reduce((sum, words) => sum + words.byteLength, dataStart)
  if (!Number.isSafeInteger(size)) throw new RangeError('Animation frame is too large')
  const bytes = new Uint8Array(size)
  bytes.set(MAGIC)
  const view = new DataView(bytes.buffer)
  view.setUint32(4, header.length, true)
  bytes.set(header, 8)
  let offset = dataStart
  for (const words of chunks) {
    if (LITTLE_ENDIAN) bytes.set(new Uint8Array(words.buffer, words.byteOffset, words.byteLength), offset)
    else for (let i = 0; i < words.length; i++) view.setUint32(offset + i * 4, words[i]!, true)
    offset += words.byteLength
  }
  return bytes
}

/** Apply a complete binary frame. Callers must order frames and keep replicas idle between them. */
export function applySurfaceAnimationBinary(target: SurfaceAnimationTarget, bytes: Uint8Array): void {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 8 || MAGIC.some((byte, i) => bytes[i] !== byte)) {
    throw new TypeError('Invalid binary animation frame')
  }
  if (typeof SharedArrayBuffer !== 'undefined' && bytes.buffer instanceof SharedArrayBuffer) {
    throw new TypeError('Binary animation frames cannot use shared memory')
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const headerSize = view.getUint32(4, true)
  const dataStart = 8 + Math.ceil(headerSize / 4) * 4
  if (dataStart > bytes.length) throw new RangeError('Truncated binary animation frame header')
  for (let i = 8 + headerSize; i < dataStart; i++) if (bytes[i] !== 0) throw new Error('Invalid binary animation frame padding')
  const header = decoder.decode(bytes.subarray(8, 8 + headerSize))
  let offset = dataStart, index = 0
  const unpack = (value: unknown): Uint32Array => {
    if (!value || typeof value !== 'object' || !('$weftWords' in value)) throw new Error('Missing binary animation word block')
    const marker = value as { $weftWords: unknown; length?: unknown }
    if (Object.keys(marker).length !== 2 || marker.$weftWords !== index ||
      !Number.isSafeInteger(marker.length) || (marker.length as number) < 0) throw new Error('Invalid binary animation word block')
    const length = marker.length as number
    const end = offset + length * 4
    if (!Number.isSafeInteger(end) || end > bytes.length) throw new RangeError('Truncated binary animation word block')
    let words: Uint32Array
    if (LITTLE_ENDIAN && (bytes.byteOffset + offset) % 4 === 0) words = new Uint32Array(bytes.buffer, bytes.byteOffset + offset, length)
    else {
      words = new Uint32Array(length)
      for (let i = 0; i < length; i++) words[i] = view.getUint32(offset + i * 4, true)
    }
    offset = end; index++
    return words
  }
  const frame = JSON.parse(header) as SurfaceAnimationFrame
  if (!frame || !frame.transform || !Array.isArray(frame.transform.nodes) || !Array.isArray(frame.nodes)) {
    throw new TypeError('Invalid binary animation frame schema')
  }
  for (const node of frame.transform.nodes) {
    if (node?.instances) node.instances.matrixBits = unpack(node.instances.matrixBits)
  }
  for (const node of frame.nodes) {
    if (node === null) continue
    if (!node || !Array.isArray(node.attributes)) throw new TypeError('Invalid binary animation node')
    for (const attribute of node.attributes) {
      if (!attribute) throw new TypeError('Invalid binary animation attribute')
      attribute.words = unpack(attribute.words)
    }
    if (node.instanceColor !== null) node.instanceColor = unpack(node.instanceColor)
  }
  if (offset !== bytes.length) throw new Error('Binary animation frame has trailing data')
  applySurfaceAnimationFrame(target, frame)
}
