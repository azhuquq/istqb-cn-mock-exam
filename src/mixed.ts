import type {Bank, Question} from './types'
import {canonicalBank} from './bank-format.mjs'
import {currentAlgorithm, getAlgorithm} from './algorithms'
import {BANK_RELEASES, CURRENT_ALGORITHM_VERSION, CURRENT_BANK_VERSION} from './versions'

export const STRUCTURE_URL = currentAlgorithm.structureURL
export const MIXED_GROUPS = currentAlgorithm.groups
export const MIXED_QUOTAS = currentAlgorithm.quotas
export interface MixedPaper {seed: string; questionIds: string[]; bankVersion: string}
export interface MixedSeed {seed:string; algorithmVersion:string; bankVersion?:string; fingerprint:string; random:number}

export async function bankFingerprint(bank: Bank): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalBank(bank)))
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2,'0')).join('').slice(0,12).toUpperCase()
}

const longSeedPattern = /^ISTQB-M[1-9]\d{0,2}-(?:B(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)-)?[0-9A-F]{12}-[0-9A-F]{8}$/
const shortSeedPattern = /^(M[1-9]\d{0,2})-([1-9A-Z][0-9A-Z]{0,6})-([0-9A-Z]{7})$/
const uint32 = (value: number) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff
// Syntax validation stays independent of installed algorithm versions.
export function isStoredMixedSeed(seed: unknown): seed is string {
  if(typeof seed !== 'string')return false
  if(longSeedPattern.test(seed))return true
  const short=shortSeedPattern.exec(seed)
  return !!short && uint32(parseInt(short[2],36)) && uint32(parseInt(short[3],36))
}
export function parseMixedSeed(input: string): MixedSeed {
  const seed = input.trim().toUpperCase()
  if (!isStoredMixedSeed(seed)) throw new Error('生成种子格式无效，请复制完整种子。')
  const short=shortSeedPattern.exec(seed)
  if(short) {
    const entry=Object.entries(BANK_RELEASES).find(([,release])=>release.seedId===parseInt(short[2],36))
    if(!entry)throw new Error(`种子对应的题库版本编号 ${short[2]} 未发布，无法复现。`)
    return {seed,algorithmVersion:short[1],bankVersion:entry[0],fingerprint:entry[1].fingerprint,random:parseInt(short[3],36)}
  }
  const parts = seed.split('-')
  const versioned = parts.length === 5
  return {seed, algorithmVersion:parts[1], bankVersion:versioned?parts[2].slice(1):undefined,
    fingerprint:parts[versioned?3:2], random:parseInt(parts[versioned?4:3],16)}
}
export function seedBankVersion(input: string): string {
  const parsed = parseMixedSeed(input)
  if (parsed.bankVersion) return parsed.bankVersion
  const entry = Object.entries(BANK_RELEASES).find(([,release]) => release.fingerprint === parsed.fingerprint)
  if (!entry) throw new Error('此生成种子的题库版本未发布，无法复现。')
  return entry[0]
}
export function normalizeMixedSeed(input: string, fingerprint: string, bankVersion?: string): string {
  const parsed = parseMixedSeed(input)
  getAlgorithm(parsed.algorithmVersion)
  if (parsed.fingerprint !== fingerprint || (parsed.bankVersion && parsed.bankVersion !== bankVersion)) {
    throw new Error('此生成种子的题库版本与所加载题库不一致，无法复现。')
  }
  return parsed.seed
}
export function compactMixedSeed(algorithmVersion: string, bankVersion: string, fingerprint: string, random: number): string {
  getAlgorithm(algorithmVersion)
  const release=Object.hasOwn(BANK_RELEASES,bankVersion)?BANK_RELEASES[bankVersion]:undefined
  if(!release||release.fingerprint!==fingerprint)throw new Error('题库版本或指纹未注册，无法生成种子。')
  if(!uint32(random))throw new Error('随机值超出生成种子的有效范围。')
  return `${algorithmVersion}-${release.seedId.toString(36)}-${random.toString(36).padStart(7,'0')}`.toUpperCase()
}
export function randomMixedSeed(fingerprint: string, bankVersion = CURRENT_BANK_VERSION): string {
  return compactMixedSeed(CURRENT_ALGORITHM_VERSION,bankVersion,fingerprint,crypto.getRandomValues(new Uint32Array(1))[0])
}
export function generateMixedPaper(questions: Question[], fingerprint: string, input: string, bankVersion = CURRENT_BANK_VERSION): MixedPaper {
  const seed = normalizeMixedSeed(input,fingerprint,bankVersion)
  const parsed = parseMixedSeed(seed)
  const questionIds = getAlgorithm(parsed.algorithmVersion).generate(questions,parsed.random)
  return {seed,questionIds,bankVersion}
}
