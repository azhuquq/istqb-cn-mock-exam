import {beforeAll, describe, expect, it} from 'vitest'
import {readFileSync} from 'node:fs'
import {bankFingerprint, generateMixedPaper, MIXED_GROUPS, randomMixedSeed} from '../src/mixed'
import {abandonState, EXAM_DURATION, finishState, freshState, getResult, parseState, startAttempt, startMixedAttempt} from '../src/core'
import {exportStudy, importStudy} from '../src/transfer'
import type {Bank} from '../src/types'

const bank: Bank = JSON.parse(readFileSync(new URL('../public/data/questions.json',import.meta.url),'utf8'))
let fingerprint: string
const seedFor = (n: number) => `ISTQB-M1-${fingerprint}-${n.toString(16).padStart(8,'0').toUpperCase()}`
beforeAll(async()=>{fingerprint=await bankFingerprint(bank)})

describe('official CTFL mixed-paper allocation',()=>{
  it('meets every chapter × K-level quota and every official LO group across 256 seeds',()=>{
    const quota = [[2,6,0],[2,4,0],[2,2,0],[0,6,5],[1,5,3],[1,1,0]]
    const seen = new Set<string>()
    const papers = new Set<string>()
    for(let seed=0;seed<256;seed++) {
      const generated=generateMixedPaper(bank.questions,fingerprint,seedFor(seed))
      expect(generated.questionIds).toHaveLength(40)
      expect(new Set(generated.questionIds).size).toBe(40)
      papers.add(generated.questionIds.join(','))
      generated.questionIds.forEach(id=>seen.add(id))
      const items=generated.questionIds.map(id=>bank.questions.find(q=>q.id===id)!)
      expect(items.every(Boolean)).toBe(true)
      for(let chapter=1;chapter<=6;chapter++) for(let k=1;k<=3;k++) {
        expect(items.filter(q=>q.chapter===chapter&&q.level===`K${k}`)).toHaveLength(quota[chapter-1][k-1])
      }
      expect(MIXED_GROUPS).toHaveLength(29)
      for(const group of MIXED_GROUPS) {
        const matches=items.filter(q=>q.level===group.level&&group.objectives.includes(q.learningObjective))
        expect(matches).toHaveLength(group.count)
        expect(new Set(matches.map(q=>q.learningObjective)).size).toBe(group.count)
      }
    }
    expect(papers.size).toBe(256)
    // Every source question, including all 26 supplementary ones, is reachable.
    expect([...seen].sort()).toEqual(bank.questions.map(q=>q.id).sort())
  })
  it('matches all four original papers against the official group configuration',()=>{
    for(const paper of 'ABCD') for(const group of MIXED_GROUPS) {
      expect(bank.questions.filter(q=>q.paper===paper&&!q.supplementary&&q.level===group.level&&group.objectives.includes(q.learningObjective))).toHaveLength(group.count)
    }
  })
  it('keeps a fixed seed’s exact ordered paper stable',()=>{
    expect(fingerprint).toBe('97B0A3C832E5')
    expect(generateMixedPaper(bank.questions,fingerprint,seedFor(0x12345678)).questionIds).toEqual([
      'A-A8','A-A14','C-19','A-26','B-38','A-A13','A-A19','A-18','B-6','A-25',
      'B-2','B-15','A-A9','C-28','B-25','B-14','B-10','A-32','A-10','D-2',
      'A-A6','B-3','B-21','A-27','A-22','B-36','C-39','A-A25','D-7','C-5',
      'B-20','C-37','B-9','A-A24','D-29','A-34','C-40','D-32','A-23','D-6',
    ])
  })
  it('is independent of question/source order and object key order, without mutating the bank',async()=>{
    const reversed = Object.fromEntries(Object.entries({...bank,questions:[...bank.questions].reverse(),sources:[...bank.sources].reverse()}).reverse()) as unknown as Bank
    const original=JSON.stringify(bank)
    const otherFingerprint=await bankFingerprint(reversed)
    expect(otherFingerprint).toBe(fingerprint)
    expect(generateMixedPaper(reversed.questions,otherFingerprint,seedFor(42))).toEqual(generateMixedPaper(bank.questions,fingerprint,seedFor(42)))
    expect(JSON.stringify(bank)).toBe(original)
    const edited=structuredClone(bank)
    edited.questions[0].explanation+='更新'
    expect(await bankFingerprint(edited)).not.toBe(fingerprint)
  })
  it('normalizes pasted seeds and creates valid random seeds',()=>{
    const generated=generateMixedPaper(bank.questions,fingerprint,seedFor(42))
    expect(generateMixedPaper(bank.questions,fingerprint,` \n${seedFor(42).toLowerCase()}\t `)).toEqual(generated)
    const random=randomMixedSeed(fingerprint)
    expect(random).toMatch(/^ISTQB-M1-[0-9A-F]{12}-[0-9A-F]{8}$/)
    expect(generateMixedPaper(bank.questions,fingerprint,random).questionIds).toHaveLength(40)
  })
  it('rejects malformed, unsupported and incompatible seeds',()=>{
    for(const seed of ['', 'hello',seedFor(1).slice(0,-1),seedFor(1).replace('M1','M2'),seedFor(1).replace(fingerprint,'000000000000')]) {
      expect(()=>generateMixedPaper(bank.questions,fingerprint,seed)).toThrow()
    }
    expect(()=>generateMixedPaper(bank.questions,fingerprint,seedFor(1).replace('M1','M2'))).toThrow('算法版本')
    expect(()=>generateMixedPaper(bank.questions,fingerprint,seedFor(1).replace(fingerprint,'000000000000'))).toThrow('题库版本')
  })
  it('refuses an undersupplied LO group rather than relaxing official quotas',()=>{
    const missing=bank.questions.filter(q=>q.learningObjective!=='FL-4.2.1')
    expect(()=>generateMixedPaper(missing,fingerprint,seedFor(1))).toThrow('题库不足')
  })
})

describe('mixed exam lifecycle and backup compatibility',()=>{
  it('starts independent timed attempts and restores the exact order, answers, flags and position',()=>{
    const paper=generateMixedPaper(bank.questions,fingerprint,seedFor(5))
    const first=startMixedAttempt(paper,1000), second=startMixedAttempt(paper,2000)
    expect(first.id).not.toBe(second.id)
    expect(first.questionIds).toEqual(second.questionIds)
    expect(first.questionIds).not.toBe(paper.questionIds)
    expect(first.deadline).toBe(1000+EXAM_DURATION)
    first.answers[first.questionIds[0]]=['A']
    first.flags=[first.questionIds[3]];first.index=3
    const state={...freshState(),activeExam:first}
    expect(parseState(JSON.stringify(state))).toEqual(state)
    expect(importStudy(exportStudy(state))).toEqual(state)
    expect(abandonState(state).activeExam).toBeNull()
    expect(abandonState(state).history).toEqual([])
  })
  it.each([false,true])('grades mixed attempts and collects only answered mistakes (timeout: %s)',timeout=>{
    const attempt=startMixedAttempt(generateMixedPaper(bank.questions,fingerprint,seedFor(123)),1000)
    const [correct,wrong]=attempt.questionIds.map(id=>bank.questions.find(q=>q.id===id)!)
    attempt.answers[correct.id]=correct.correctAnswers
    attempt.answers[wrong.id]=[wrong.options.find(o=>!wrong.correctAnswers.includes(o.id))!.id]
    attempt.answers[attempt.questionIds[2]]=[]
    const state=finishState({...freshState(),activeExam:attempt},bank.questions,timeout?attempt.deadline+1:2000)
    expect(state.mistakes).toEqual([wrong.id])
    expect(state.history[0].endedAt).toBe(timeout?attempt.deadline:2000)
    expect(getResult(state.history[0],bank.questions)).toMatchObject({score:1,unanswered:38,passed:false})
    expect(importStudy(exportStudy(state))).toEqual(state)
    expect(finishState(state,bank.questions)).toBe(state)
  })
  it('round-trips mixed and legacy history together and settles an expired imported attempt',()=>{
    const legacy=finishState({...freshState(),activeExam:startAttempt('A',bank.questions,1000)},bank.questions,2000)
    expect(parseState(JSON.stringify(legacy))).toEqual(legacy)
    const active=startMixedAttempt(generateMixedPaper(bank.questions,fingerprint,seedFor(4)),3000)
    const restored=importStudy(exportStudy({...legacy,activeExam:active}))
    const settled=finishState(restored,bank.questions,active.deadline+1)
    expect(settled.history.map(a=>a.paper)).toEqual(['mixed','A'])
    expect(settled.history[0].endedAt).toBe(active.deadline)
    expect(settled.mistakes).toEqual([])
    expect(importStudy(exportStudy(settled))).toEqual(settled)
  })
  it('keeps stored papers usable when their seed algorithm or bank version is older',()=>{
    const active=startMixedAttempt(generateMixedPaper(bank.questions,fingerprint,seedFor(2)),1000)
    active.seed='ISTQB-M2-000000000000-00000001'
    expect(parseState(JSON.stringify({...freshState(),activeExam:active})).activeExam).toEqual(active)
  })
  it('rejects damaged mixed attempts and still enforces original-paper order',()=>{
    const original=startMixedAttempt(generateMixedPaper(bank.questions,fingerprint,seedFor(1)),1000)
    const variants=Array.from({length:5},()=>structuredClone(original))
    variants[0].questionIds[0]=variants[0].questionIds[1]
    variants[1].questionIds[0]='A-A27'
    variants[2].seed='invalid'
    const outside=bank.questions.find(q=>!original.questionIds.includes(q.id))!.id
    variants[3].answers[outside]=['A']
    variants[4].flags=[outside]
    for(const activeExam of variants) expect(()=>parseState(JSON.stringify({...freshState(),activeExam}))).toThrow()
    const legacy=startAttempt('A',bank.questions,1000)
    legacy.questionIds.reverse()
    expect(()=>parseState(JSON.stringify({...freshState(),activeExam:legacy}))).toThrow()
  })
})
