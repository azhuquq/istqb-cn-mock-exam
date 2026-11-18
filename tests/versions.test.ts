import {describe, expect, it, vi} from 'vitest'
import {readFileSync, mkdtempSync, mkdirSync, cpSync, symlinkSync, writeFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import releases from '../public/data/releases.json'
import {ALGORITHMS, getAlgorithm} from '../src/algorithms'
import {attemptBankVersion, createBankLoader, generateFromSeed, getPracticeQuestions, loadStudyBanks, restoreStudyState, studyBankVersions} from '../src/banks'
import {bankFingerprint, compactMixedSeed, generateMixedPaper, isStoredMixedSeed, parseMixedSeed, randomMixedSeed, seedBankVersion} from '../src/mixed'
import {finishState, freshState, getResult, isCorrect, parseState, practiceBankVersion, startAttempt, startMixedAttempt, submitPracticeAnswer, updatePracticeAnswer} from '../src/core'
import {exportStudy, importStudy} from '../src/transfer'
import type {Bank} from '../src/types'

const bank: Bank=JSON.parse(readFileSync(new URL('../public/data/banks/1.0.0.json',import.meta.url),'utf8'))
const legacy='ISTQB-M1-97B0A3C832E5-12345678'
const versioned='ISTQB-M1-B1.0.0-97B0A3C832E5-12345678'
const compact='M1-1-051U7I0'
const bytes=readFileSync(new URL('../public/data/banks/1.0.0.json',import.meta.url))
const fetcher=()=>vi.fn(async()=>new Response(bytes)) as unknown as typeof fetch

describe('versioned banks and algorithms',()=>{
  it('registers a frozen M1 implementation and validates the published snapshot',async()=>{
    expect(Object.keys(ALGORITHMS).sort()).toEqual(Object.keys(releases.algorithms).sort())
    for(const release of Object.values(releases.algorithms)) {
      const source=readFileSync(new URL('../'+release.path,import.meta.url))
      expect(createHash('sha256').update(source).digest('hex')).toBe(release.sha256)
    }
    expect(getAlgorithm('M1')).toBe(ALGORITHMS.M1)
    expect(()=>getAlgorithm('M2')).toThrow('不受支持')
    expect(await createBankLoader(fetcher())('1.0.0')).toEqual(bank)
  })
  it('reproduces the original paper for both new and legacy seed formats',async()=>{
    const load=vi.fn(async()=>bank)
    const old=await generateFromSeed(legacy,load), next=await generateFromSeed(versioned,load)
    expect(next.questionIds).toEqual(old.questionIds)
    expect(old.questionIds[0]).toBe('A-A8')
    expect(old.bankVersion).toBe('1.0.0')
    expect(next.seed).toBe(versioned)
    expect(seedBankVersion(legacy)).toBe('1.0.0')
    expect(parseMixedSeed(` \n${versioned.toLowerCase()} `)).toMatchObject({seed:versioned,bankVersion:'1.0.0',algorithmVersion:'M1',random:0x12345678})
    expect(parseMixedSeed(randomMixedSeed(await bankFingerprint(bank)))).toMatchObject({bankVersion:'1.0.0',algorithmVersion:'M1'})
  })
  it('uses a 12-character seed without changing the original ordered paper',async()=>{
    const encoded=compactMixedSeed('M1','1.0.0','97B0A3C832E5',0x12345678)
    expect(encoded).toBe(compact)
    expect(encoded).toHaveLength(12)
    expect(versioned).toHaveLength(37)
    expect(parseMixedSeed(encoded)).toMatchObject({seed:compact,algorithmVersion:'M1',bankVersion:'1.0.0',fingerprint:'97B0A3C832E5',random:0x12345678})
    expect(seedBankVersion(encoded)).toBe('1.0.0')
    const load=async()=>bank
    const short=await generateFromSeed(encoded,load)
    expect(short.questionIds).toEqual((await generateFromSeed(legacy,load)).questionIds)
    expect(short.questionIds).toEqual((await generateFromSeed(versioned,load)).questionIds)
    expect(await generateFromSeed(` \n${encoded.toLowerCase()}\t `,load)).toEqual(short)
    const state={...freshState(),activeExam:startMixedAttempt(short,1000)}
    expect(importStudy(exportStudy(state))).toEqual(state)
  })
  it('round-trips the entire 32-bit range at its boundaries and preserves random values',()=>{
    for(const random of [0,1,35,36,0x12345678,0x7fffffff,0x80000000,0xffffffff]) {
      const encoded=compactMixedSeed('M1','1.0.0','97B0A3C832E5',random)
      expect(encoded).toHaveLength(12)
      expect(isStoredMixedSeed(encoded)).toBe(true)
      expect(parseMixedSeed(encoded).random).toBe(random)
    }
    expect(compactMixedSeed('M1','1.0.0','97B0A3C832E5',0)).toBe('M1-1-0000000')
    expect(compactMixedSeed('M1','1.0.0','97B0A3C832E5',0xffffffff)).toBe('M1-1-1Z141Z3')
    for(const random of [-1,0x100000000,1.5,NaN,Infinity])expect(()=>compactMixedSeed('M1','1.0.0','97B0A3C832E5',random)).toThrow()
  })
  it('rejects malformed compact seeds, unknown release IDs and unsupported algorithms',async()=>{
    for(const seed of ['M1-0-051U7I0','M1-01-051U7I0','M1-1-51U7I0','M1-1-1Z141Z4','M1-1-ZZZZZZZ','M1-1-051U7I00','M1-1-051U7I!']) {
      expect(isStoredMixedSeed(seed)).toBe(false)
      expect(()=>parseMixedSeed(seed)).toThrow('格式无效')
    }
    expect(()=>parseMixedSeed('M1-2-051U7I0')).toThrow('未发布')
    await expect(generateFromSeed(compact.replace('M1','M2'),async()=>bank)).rejects.toThrow('算法版本')
    expect(()=>compactMixedSeed('M1','1.0.0','000000000000',1)).toThrow('指纹')
  })
  it('loads the version in the seed even if a newer bank is available',async()=>{
    const updated=structuredClone(bank)
    updated.bankVersion='1.0.1'
    updated.questions[0].explanation+='新版解析'
    const updatedFingerprint=await bankFingerprint(updated)
    const loader=vi.fn(async(version:string)=>version==='1.0.0'?bank:updated)
    const old=await generateFromSeed(versioned,loader)
    const next=await generateFromSeed(`ISTQB-M1-B1.0.1-${updatedFingerprint}-12345678`,loader)
    expect(loader.mock.calls.map(([version])=>version)).toEqual(['1.0.0','1.0.1'])
    expect({...old,seed:legacy}).toEqual(await generateFromSeed(legacy,loader))
    expect(next.bankVersion).toBe('1.0.1')
    expect(()=>generateMixedPaper(bank.questions,'97B0A3C832E5',versioned,'1.0.1')).toThrow('题库版本')
    await expect(generateFromSeed(versioned,async()=>updated)).rejects.toThrow('指纹')
  })
  it('shares concurrent loads and retries after network or integrity failures',async()=>{
    const get=fetcher(), load=createBankLoader(get)
    const [first,second]=await Promise.all([load('1.0.0'),load('1.0.0')])
    expect(first).toBe(second)
    expect(get).toHaveBeenCalledOnce()
    const request=vi.fn().mockResolvedValueOnce(new Response('missing',{status:404})).mockResolvedValueOnce(new Response('corrupted')).mockResolvedValue(new Response(bytes))
    const retry=createBankLoader(request)
    await expect(retry('1.0.0')).rejects.toThrow('加载失败')
    await expect(retry('1.0.0')).rejects.toThrow('完整性')
    expect(await retry('1.0.0')).toEqual(bank)
    await expect(load('9.9.9')).rejects.toThrow('未发布')
    await expect(generateFromSeed(versioned.replace('M1','M2'),get as never)).rejects.toThrow('算法版本')
  })
  it('pins new attempts and recovers legacy attempts without version metadata',async()=>{
    const paper=await generateFromSeed(legacy,async()=>bank)
    const active=startMixedAttempt(paper,1000)
    expect(active.bankVersion).toBe('1.0.0')
    expect(attemptBankVersion(active)).toBe('1.0.0')
    const old=structuredClone(active)
    delete old.bankVersion
    expect(attemptBankVersion(old)).toBe('1.0.0')
    const formal=startAttempt('A',bank.questions,1000)
    delete formal.bankVersion
    expect(attemptBankVersion(formal)).toBe('1.0.0')
    expect(importStudy(exportStudy({...freshState(),activeExam:old})).activeExam).toEqual(old)
    const malformed={...active,bankVersion:'not-a-version'}
    expect(()=>parseState(JSON.stringify({...freshState(),activeExam:malformed}))).toThrow()
    expect(()=>parseState(JSON.stringify({...freshState(),activeExam:{...active,seed:versioned,bankVersion:'1.0.1'}}))).toThrow()
  })
  it('restores multiple bank versions and settles an expired attempt using its original answers',async()=>{
    const updated=structuredClone(bank);updated.bankVersion='1.0.1'
    const paper=await generateFromSeed(versioned,async()=>bank)
    const active=startMixedAttempt(paper,1000)
    const question=bank.questions.find(q=>q.id===active.questionIds[0])!
    active.answers[question.id]=question.correctAnswers
    updated.questions.find(q=>q.id===question.id)!.correctAnswers=['A']
    const newer=finishState({...freshState(),activeExam:startAttempt('B',updated.questions,2000,'1.0.1')},updated.questions,3000)
    const state={...newer,activeExam:active}, snapshot=structuredClone(state)
    const loader=vi.fn(async(version:string)=>version==='1.0.0'?bank:updated)
    expect(Object.keys(await loadStudyBanks(state,loader)).sort()).toEqual(['1.0.0','1.0.1'])
    const restored=await restoreStudyState(state,loader,active.deadline+1)
    expect(restored.state.activeExam).toBeNull()
    expect(restored.state.history[0].endedAt).toBe(active.deadline)
    expect(getResult(restored.state.history[0],restored.banks['1.0.0'].questions).score).toBe(1)
    expect(getResult(restored.state.history[0],updated.questions).score).toBe(0)
    expect(state).toEqual(snapshot)
    await expect(restoreStudyState(state,async()=>{throw new Error('offline')})).rejects.toThrow('offline')
    expect(state).toEqual(snapshot)
  })
})

describe('bank release tooling',()=>{
  it('publishes a new snapshot, keeps old releases intact, and refuses overwrites or frozen changes',()=>{
    const root=mkdtempSync(join(tmpdir(),'istqb-releases-'))
    try {
      mkdirSync(join(root,'src/algorithms'),{recursive:true})
      mkdirSync(join(root,'public'),{recursive:true})
      cpSync(new URL('../scripts',import.meta.url),join(root,'scripts'),{recursive:true})
      cpSync(new URL('../src/bank-format.mjs',import.meta.url),join(root,'src/bank-format.mjs'))
      cpSync(new URL('../src/question-ids.mjs',import.meta.url),join(root,'src/question-ids.mjs'))
      cpSync(new URL('../src/algorithms/m1.ts',import.meta.url),join(root,'src/algorithms/m1.ts'))
      cpSync(new URL('../public/data',import.meta.url),join(root,'public/data'),{recursive:true})
      symlinkSync(new URL('../public/questions',import.meta.url).pathname,join(root,'public/questions'))
      symlinkSync(new URL('../public/sources',import.meta.url).pathname,join(root,'public/sources'))
      const run=(version:string)=>execFileSync(process.execPath,[join(root,'scripts/release-bank.mjs'),version],{cwd:root,stdio:'pipe'})
      for(const invalid of ['noncanonical','swapped','supplementary']) {
        const broken=structuredClone(bank)
        if(invalid==='noncanonical')broken.questions[0].id='A-01'
        if(invalid==='swapped')[broken.questions[0].id,broken.questions[1].id]=[broken.questions[1].id,broken.questions[0].id]
        if(invalid==='supplementary')broken.questions.find(q=>q.id==='A-A1')!.id='B-A1'
        writeFileSync(join(root,'public/data/questions.json'),JSON.stringify(broken,null,2)+'\n')
        expect(()=>run('1.0.1')).toThrow()
        expect(JSON.parse(readFileSync(join(root,'public/data/releases.json'),'utf8'))).toEqual(releases)
        expect(readFileSync(join(root,'public/data/banks/1.0.0.json'))).toEqual(bytes)
      }
      const working=structuredClone(bank);working.questions[0].explanation+=' 新版解析'
      writeFileSync(join(root,'public/data/questions.json'),JSON.stringify(working,null,2)+'\n')
      run('1.0.1')
      expect(readFileSync(join(root,'public/data/banks/1.0.0.json'))).toEqual(bytes)
      const manifest=JSON.parse(readFileSync(join(root,'public/data/releases.json'),'utf8'))
      expect(manifest.currentBank).toBe('1.0.1')
      expect(manifest.banks['1.0.0']).toEqual(releases.banks['1.0.0'])
      expect(manifest.banks['1.0.1'].seedId).toBe(2)
      expect(JSON.parse(readFileSync(join(root,'public/data/banks/1.0.1.json'),'utf8')).bankVersion).toBe('1.0.1')
      expect(()=>run('1.0.1')).toThrow()
      expect(()=>run('1.0.2')).toThrow() // No content change.
      writeFileSync(join(root,'public/data/banks/1.0.0.json'),Buffer.concat([bytes,Buffer.from(' ')]))
      expect(()=>run('1.0.2')).toThrow() // Frozen snapshot changed.
    } finally {rmSync(root,{recursive:true,force:true})}
  })
})

describe('versioned ordinary practice',()=>{
  const updated=structuredClone(bank)
  updated.bankVersion='1.0.1'
  updated.questions[0].correctAnswers=['A']
  updated.questions[0].explanation='新版题目解析，与旧版的正确答案不同。'
  const banks={'1.0.0':bank,'1.0.1':updated}
  it('preserves the original question and grade after a bank upgrade and a backup round trip',async()=>{
    const original=bank.questions[0]
    const state=submitPracticeAnswer(freshState(),original,original.correctAnswers,bank.bankVersion)
    const restored=await restoreStudyState(importStudy(exportStudy(state)),async version=>banks[version as keyof typeof banks])
    expect(studyBankVersions(restored.state)).toEqual(['1.0.0'])
    expect(restored.banks['1.0.0']).toBe(bank)
    const questions=getPracticeQuestions(updated,restored.state,{...restored.banks,'1.0.1':updated})
    expect(questions[0]).toEqual(original)
    expect(isCorrect(restored.state.practice.answers[original.id],questions[0].correctAnswers)).toBe(true)
    expect(isCorrect(restored.state.practice.answers[original.id],updated.questions[0].correctAnswers)).toBe(false)
    expect(practiceBankVersion(restored.state,original.id,updated.bankVersion)).toBe('1.0.0')
    expect(practiceBankVersion(restored.state,'A-2',updated.bankVersion)).toBe('1.0.1')
  })
  it('treats unversioned legacy answers as bank 1.0.0 without silently regrading them',()=>{
    const legacy=freshState()
    legacy.practice.answers={'A-1':['C']};legacy.practice.submitted={'A-1':true}
    const state=parseState(JSON.stringify(legacy))
    expect(studyBankVersions(state)).toEqual(['1.0.0'])
    expect(practiceBankVersion(state,'A-1',updated.bankVersion)).toBe('1.0.0')
    expect(getPracticeQuestions(updated,state,banks)[0]).toBe(bank.questions[0])
  })
  it('switches only the explicitly retried question to the current bank',()=>{
    let state=submitPracticeAnswer(freshState(),bank.questions[0],['C'],bank.bankVersion)
    state=submitPracticeAnswer(state,bank.questions[1],bank.questions[1].correctAnswers,bank.bankVersion)
    state=updatePracticeAnswer(state,'A-1',[],updated.bankVersion)
    expect(state.practice.submitted['A-1']).toBe(false)
    expect(state.practice.answers['A-1']).toEqual([])
    expect(getPracticeQuestions(updated,state,banks)[0]).toBe(updated.questions[0])
    expect(getPracticeQuestions(updated,state,banks)[1]).toBe(bank.questions[1])
    state=submitPracticeAnswer(state,updated.questions[0],['A'],updated.bankVersion)
    expect(state.practice.bankVersions).toEqual({'A-1':'1.0.1','A-2':'1.0.0'})
    expect(importStudy(exportStudy(state))).toEqual(state)
  })
  it('rejects malformed saved practice versions while preserving the original state',()=>{
    const state=submitPracticeAnswer(freshState(),bank.questions[0],['C'],bank.bankVersion)
    const original=structuredClone(state)
    for(const bankVersions of [{'A-1':'broken'},{'A-01':'1.0.0'},{'A-1':2},[]]) {
      expect(()=>parseState(JSON.stringify({...state,practice:{...state.practice,bankVersions}}))).toThrow()
    }
    expect(state).toEqual(original)
  })
})
