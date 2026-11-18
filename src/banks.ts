import type {Attempt, Bank, StudyState} from './types'
import {bankFingerprint, generateMixedPaper, parseMixedSeed, seedBankVersion} from './mixed'
import {getAlgorithm} from './algorithms'
import {finishState, parseState} from './core'
import {BANK_RELEASES, CURRENT_BANK_VERSION, LEGACY_BANK_VERSION} from './versions'

export type BankLoader = (version: string) => Promise<Bank>
export function createBankLoader(fetcher: typeof fetch = fetch): BankLoader {
  const cache = new Map<string,Promise<Bank>>()
  return (version: string) => {
    if (cache.has(version)) return cache.get(version)!
    const release = Object.hasOwn(BANK_RELEASES,version) ? BANK_RELEASES[version] : undefined
    if (!release) return Promise.reject(new Error(`题库版本 ${version} 未发布，当前记录已保留。`))
    const promise = (async()=>{
      const response = await fetcher(release.path)
      if (!response.ok) throw new Error(`题库 ${version} 加载失败，请检查网络后重试。`)
      const bytes = await response.arrayBuffer()
      const digest = await crypto.subtle.digest('SHA-256',bytes)
      const hash = [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')
      if (hash !== release.sha256) throw new Error(`题库 ${version} 完整性校验失败。`)
      const bank: Bank = JSON.parse(new TextDecoder().decode(bytes))
      if (bank.version !== 1 || bank.bankVersion !== version || bank.questions?.length !== 186 || await bankFingerprint(bank) !== release.fingerprint) {
        throw new Error(`题库 ${version} 的版本或内容不完整。`)
      }
      return bank
    })().catch(error=>{cache.delete(version);throw error})
    cache.set(version,promise)
    return promise
  }
}
export const loadBank = createBankLoader()
export const loadCurrentBank = () => loadBank(CURRENT_BANK_VERSION)
export function attemptBankVersion(attempt: Attempt): string {
  return attempt.bankVersion || (attempt.paper === 'mixed' ? seedBankVersion(attempt.seed) : LEGACY_BANK_VERSION)
}
export async function loadStudyBanks(state: StudyState, loader: BankLoader = loadBank): Promise<Record<string,Bank>> {
  const attempts = state.activeExam ? [state.activeExam,...state.history] : state.history
  const versions = [...new Set(attempts.map(attemptBankVersion))]
  return Object.fromEntries(await Promise.all(versions.map(async version=>[version,await loader(version)])))
}
export async function bankForSeed(seed: string, loader: BankLoader = loadBank) {
  const parsed = parseMixedSeed(seed)
  getAlgorithm(parsed.algorithmVersion)
  const bank = await loader(seedBankVersion(seed))
  if (await bankFingerprint(bank) !== parsed.fingerprint) throw new Error('生成种子的题库指纹与发布版本不一致。')
  return bank
}
export async function generateFromSeed(seed: string, loader: BankLoader = loadBank) {
  const bank = await bankForSeed(seed,loader)
  return generateMixedPaper(bank.questions,await bankFingerprint(bank),seed,bank.bankVersion)
}
export async function restoreStudyState(next: StudyState, loader: BankLoader = loadBank, now?: number) {
  const validated=parseState(JSON.stringify(next))
  const banks=await loadStudyBanks(validated,loader)
  const settledAt=now??Date.now()
  const state=validated.activeExam&&settledAt>=validated.activeExam.deadline
    ? finishState(validated,banks[attemptBankVersion(validated.activeExam)].questions,settledAt):validated
  return {state,banks}
}
