import {describe, expect, it} from 'vitest'
import {readFileSync} from 'node:fs'
import {EXAM_DURATION, filterQuestions, finishState, formatTime, freshState, getResult, isCorrect, parseState, remaining, startAttempt, toggleOption} from '../src/core'
import type {Bank} from '../src/types'
const bank: Bank=JSON.parse(readFileSync(new URL('../public/data/questions.json',import.meta.url),'utf8'))

describe('answer grading',()=>{
  it('requires the exact set for multiple-choice, without order sensitivity',()=>{
    expect(isCorrect(['E','B'],['B','E'])).toBe(true)
    for(const selection of [[],['B'],['B','D'],['B','E','A'],['B','B']])expect(isCorrect(selection,['B','E'])).toBe(false)
    expect(isCorrect(undefined,['A'])).toBe(false)
  })
  it('switches single choice and independently toggles multiple choices',()=>{
    expect(toggleOption(['A'],'B',1)).toEqual(['B'])
    expect(toggleOption(['A'],'A',1)).toEqual([])
    expect(toggleOption(['A'],'B',2)).toEqual(['A','B'])
    expect(toggleOption(['A','B'],'A',2)).toEqual(['B'])
  })
})
describe('real exam lifecycle',()=>{
  it('includes only the 40 formal questions, never supplementary questions',()=>{
    const a=startAttempt('A',bank.questions,1000)
    expect(a.questionIds).toHaveLength(40)
    expect(a.questionIds).not.toContain('A-A1')
    expect(a.deadline-a.startedAt).toBe(EXAM_DURATION)
    expect(remaining(a,a.deadline+1000)).toBe(0)
    expect(formatTime(EXAM_DURATION)).toBe('60:00')
    expect(formatTime(1)).toBe('00:01')
  })
  it.each([25,26,40])('grades %i correct answers at the 26-point boundary',count=>{
    const a=startAttempt('B',bank.questions,1000)
    a.questionIds.slice(0,count).forEach(id=>{a.answers[id]=bank.questions.find(q=>q.id===id)!.correctAnswers})
    const state={...freshState(),activeExam:a,mistakes:['A-1']}
    const finished=finishState(state,bank.questions,a.deadline+20000)
    expect(finished.activeExam).toBeNull()
    expect(finished.history).toHaveLength(1)
    expect(finished.history[0].endedAt).toBe(a.deadline)
    const r=getResult(finished.history[0],bank.questions)
    expect(r.score).toBe(count)
    expect(r.passed).toBe(count>=26)
    expect(r.unanswered).toBe(40-count)
    expect(finished.mistakes).toEqual(['A-1'])
    expect(finishState(finished,bank.questions)).toBe(finished)
    expect(r.chapters.reduce((s,c)=>s+c.correct,0)).toBe(count)
  })
  it.each([false,true])('collects only answered mistakes on settlement (timeout: %s)',timeout=>{
    const a=startAttempt('B',bank.questions,1000)
    const items=bank.questions.filter(q=>a.questionIds.includes(q.id))
    const singles=items.filter(q=>q.selectionCount===1)
    const [wrong,correct,cleared,flagged]=singles
    const partial=items.find(q=>q.selectionCount>1)!
    a.answers={
      [wrong.id]:[wrong.options.find(o=>!wrong.correctAnswers.includes(o.id))!.id],
      [correct.id]:correct.correctAnswers,
      [partial.id]:[partial.correctAnswers[0]],
      [cleared.id]:[],
    }
    a.flags=[cleared.id,flagged.id]
    const state={...freshState(),activeExam:a,mistakes:['A-1',wrong.id,cleared.id]}
    const finished=finishState(state,bank.questions,timeout?a.deadline+20000:2000)
    expect(finished.mistakes).toEqual(['A-1',wrong.id,cleared.id,partial.id])
    const result=getResult(finished.history[0],bank.questions)
    expect(result.score).toBe(1)
    expect(result.unanswered).toBe(37)
    expect(finished.history[0].answers).toEqual(a.answers)
    expect(state.activeExam).toBe(a)
  })
  it('does not collect mistakes when an exam is submitted without any answers',()=>{
    const a=startAttempt('A',bank.questions,1000)
    a.answers={'A-1':[]}
    a.flags=['A-1','A-2']
    const finished=finishState({...freshState(),activeExam:a},bank.questions,2000)
    expect(finished.mistakes).toEqual([])
    expect(getResult(finished.history[0],bank.questions)).toMatchObject({score:0,unanswered:40})
  })
  it('preserves active deadline, answers, flags and position through reload',()=>{
    const a=startAttempt('D',bank.questions,1000)
    a.answers={'D-20':['B','E']};a.index=19;a.flags=['D-20']
    const state={...freshState(),activeExam:a}
    expect(parseState(JSON.stringify(state))).toEqual(state)
    expect(remaining(parseState(JSON.stringify(state)).activeExam!,a.startedAt+30000)).toBe(EXAM_DURATION-30000)
  })
})
describe('practice and storage',()=>{
  it('filters formal papers, supplementary questions, chapters and mistakes',()=>{
    expect(filterQuestions(bank.questions,'paper:A',[])).toHaveLength(40)
    expect(filterQuestions(bank.questions,'extra',[])).toHaveLength(26)
    expect(filterQuestions(bank.questions,'chapter:4',[]).every(q=>q.chapter===4)).toBe(true)
    expect(filterQuestions(bank.questions,'mistakes',['A-1','D-40']).map(q=>q.id)).toEqual(['A-1','D-40'])
  })
  it('defaults only when missing and rejects damaged or future records',()=>{
    expect(parseState(null)).toEqual(freshState())
    expect(()=>parseState('{oops')).toThrow()
    expect(()=>parseState(JSON.stringify({...freshState(),schemaVersion:2}))).toThrow()
    expect(()=>parseState(JSON.stringify({...freshState(),practice:{...freshState().practice,answers:{'A-1':'A'}}}))).toThrow()
  })
  it('rejects a malformed exam before the reader can navigate to a missing question',()=>{
    const a=startAttempt('A',bank.questions,1000)
    a.questionIds[4]='Z-500'
    expect(()=>parseState(JSON.stringify({...freshState(),activeExam:a}))).toThrow()
    expect(()=>parseState(JSON.stringify({...freshState(),mistakes:['A-A27']}))).toThrow()
  })
})
