import {compress, decompress} from 'lz4js'
import {parseState} from './core'
import type {StudyState} from './types'

export const MAX_BACKUP_BYTES = 8 * 1024 * 1024
export const MAX_BACKUP_CODE_LENGTH = 12 * 1024 * 1024
const PREFIX = 'ISTQB-LZ4-v1'
const INVALID = '备份码不完整、已损坏或版本不受支持，请重新复制完整备份码。'

function checksum(bytes: Uint8Array): string {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0')
}

// lz4js does not validate block boundaries or output bounds. Walk the frame
// before decoding so a pasted frame cannot trigger unbounded loops/allocation.
// Version 1 accepts precisely the frame descriptor written by our exporter.
function validateFrame(bytes: Uint8Array, expectedSize: number) {
  const header = [4, 34, 77, 24, 64, 112, 223]
  if (bytes.length < 11 || !header.every((value, i) => bytes[i] === value)) throw new Error(INVALID)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 7, output = 0
  const addOutput = (size: number) => {
    output += size
    if (output > expectedSize) throw new Error(INVALID)
  }
  while (offset + 4 <= bytes.length) {
    const descriptor = view.getUint32(offset, true)
    offset += 4
    if (descriptor === 0) {
      if (offset !== bytes.length || output !== expectedSize) throw new Error(INVALID)
      return
    }
    const size = descriptor & 0x7fffffff
    const end = offset + size
    if (!size || size > 4 * 1024 * 1024 || end > bytes.length) throw new Error(INVALID)
    if (descriptor & 0x80000000) {
      addOutput(size)
      offset = end
      continue
    }
    const blockStart = output
    const readLength = (initial: number) => {
      let length = initial
      if (initial === 15) {
        let extension: number
        do {
          if (offset >= end) throw new Error(INVALID)
          extension = bytes[offset++]
          length += extension
        } while (extension === 255)
      }
      return length
    }
    while (offset < end) {
      const token = bytes[offset++]
      const literals = readLength(token >>> 4)
      if (offset + literals > end) throw new Error(INVALID)
      offset += literals
      addOutput(literals)
      if (offset === end) break
      if (offset + 2 > end) throw new Error(INVALID)
      const distance = view.getUint16(offset, true)
      offset += 2
      if (!distance || distance > output) throw new Error(INVALID)
      addOutput(readLength(token & 15) + 4)
    }
    if (output - blockStart > 4 * 1024 * 1024) throw new Error(INVALID)
  }
  throw new Error(INVALID)
}

export function exportStudy(state: StudyState): string {
  const json = JSON.stringify(parseState(JSON.stringify(state)))
  const bytes = new TextEncoder().encode(json)
  if (bytes.length > MAX_BACKUP_BYTES) throw new Error('学习记录超过 8 MiB，暂时无法生成备份码。')
  const compressed = compress(bytes)
  let binary = ''
  for (let i = 0; i < compressed.length; i += 8192) binary += String.fromCharCode(...compressed.subarray(i, i + 8192))
  return `${PREFIX}:${bytes.length}:${checksum(bytes)}:${btoa(binary)}`
}

export function importStudy(code: string): StudyState {
  if (code.length > MAX_BACKUP_CODE_LENGTH) throw new Error('备份码过大，最多支持 8 MiB 的原始学习记录。')
  const parts = code.trim().split(':')
  if (parts.length !== 4 || parts[0] !== PREFIX || !/^[1-9]\d{0,7}$/.test(parts[1]) || !/^[a-f0-9]{8}$/.test(parts[2])) throw new Error(INVALID)
  const size = Number(parts[1])
  if (size > MAX_BACKUP_BYTES) throw new Error('备份中的学习记录超过 8 MiB，无法导入。')
  // Allow line wrapping in a copied code, but require canonical Base64.
  const base64 = parts[3].replace(/\s/g, '')
  if (!base64 || base64.length % 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) throw new Error(INVALID)
  let bytes: Uint8Array
  try {
    const binary = atob(base64)
    const compressed = Uint8Array.from(binary, char => char.charCodeAt(0))
    validateFrame(compressed, size)
    bytes = decompress(compressed, size)
    if (bytes.length !== size || checksum(bytes) !== parts[2]) throw new Error(INVALID)
    return parseState(new TextDecoder('utf-8', {fatal: true}).decode(bytes))
  } catch {throw new Error(INVALID)}
}
