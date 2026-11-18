import {describe, expect, it, vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {finishState, freshState, isCorrect, parseState, removeMistake, startAttempt, startMixedAttempt, submitPracticeAnswer, updatePracticeAnswer} from '../src/core'
import {generateMixedPaper} from '../src/mixed'
import {loadStudyBanks} from '../src/banks'
import {exportStudy, importStudy} from '../src/transfer'
import type {Bank, StudyState} from '../src/types'

const bank: Bank=JSON.parse(readFileSync(new URL('../public/data/questions.json',import.meta.url),'utf8'))
const newExam=(paper:'A'|'mixed',now=1000)=>paper==='A'?startAttempt('A',bank.questions,now):startMixedAttempt(generateMixedPaper(bank.questions,'97B0A3C832E5','M1-1-051U7I0'),now)
function withoutResponses(state: StudyState) {
  const {mistakeResponses,...legacy}=state
  return legacy
}

describe('exam answers in the mistake notebook',()=>{
  it.each([
    {paper:'A',timeout:false},{paper:'A',timeout:true},
    {paper:'mixed',timeout:false},{paper:'mixed',timeout:true},
  ] as const)('records selected answers on $paper settlement (timeout: $timeout) without changing practice progress',({paper,timeout})=>{
    const active=newExam(paper)
    const [wrong,correct,cleared]=active.questionIds.slice(0,3).map(id=>bank.questions.find(q=>q.id===id)!)
    const selected=[wrong.options.find(o=>!wrong.correctAnswers.includes(o.id))!.id]
    active.answers={[wrong.id]:selected,[correct.id]:correct.correctAnswers,[cleared.id]:[]}
    const state={...freshState(),activeExam:active}
    state.practice={filter:'chapter:4',index:8,answers:{[wrong.id]:['E']},submitted:{[wrong.id]:true}}
    const before=structuredClone(state)
    const finished=finishState(state,bank.questions,timeout?active.deadline+1:2000)
    expect(finished.mistakes).toEqual([wrong.id])
    expect(finished.mistakeResponses).toEqual({[wrong.id]:{answers:selected,submitted:true,bankVersion:'1.0.0',source:'exam',attemptId:active.id}})
    expect(finished.mistakeResponses[wrong.id].answers).not.toBe(selected)
    expect(finished.practice).toEqual(before.practice)
    expect(state).toEqual(before)
    expect(importStudy(exportStudy(finished))).toEqual(finished)
    expect(finished.mistakeResponses[correct.id]).toBeUndefined()
    expect(finished.mistakeResponses[cleared.id]).toBeUndefined()
  })
  it('preserves multiple selections and updates an existing mistake with the latest wrong exam answer',()=>{
    const q=bank.questions.find(q=>q.paper==='B'&&!q.supplementary&&q.selectionCount>1)!
    let state=submitPracticeAnswer(freshState(),q,[q.correctAnswers[0]],bank.bankVersion)
    const active=startAttempt('B',bank.questions,1000)
    const selected=[q.correctAnswers[0],q.options.find(o=>!q.correctAnswers.includes(o.id))!.id]
    active.answers[q.id]=selected
    state=finishState({...state,activeExam:active},bank.questions,2000)
    expect(state.mistakes).toEqual([q.id])
    expect(state.mistakeResponses[q.id].answers).toEqual(selected)
    expect(state.mistakeResponses[q.id].source).toBe('exam')
    expect(state.practice.answers[q.id]).toEqual([q.correctAnswers[0]])
    const correct=startAttempt('B',bank.questions,3000)
    correct.answers[q.id]=q.correctAnswers
    const later=finishState({...state,activeExam:correct},bank.questions,4000)
    expect(later.mistakeResponses[q.id]).toEqual(state.mistakeResponses[q.id])
  })
  it('supports explicit retry, saved drafts, corrected answers, and manual removal',()=>{
    const active=newExam('mixed')
    const q=bank.questions.find(q=>q.id===active.questionIds[0])!
    active.answers[q.id]=[q.options.find(o=>!q.correctAnswers.includes(o.id))!.id]
    const finished=finishState({...freshState(),activeExam:active},bank.questions,2000)
    const retry=updatePracticeAnswer(finished,q.id,[],bank.bankVersion,true)
    expect(retry.mistakeResponses[q.id]).toMatchObject({answers:[],submitted:false,source:'practice'})
    expect(importStudy(exportStudy(retry))).toEqual(retry)
    const chosen=updatePracticeAnswer(retry,q.id,q.correctAnswers,bank.bankVersion,true)
    const corrected=submitPracticeAnswer(chosen,q,q.correctAnswers,bank.bankVersion,true)
    expect(corrected.mistakes).toContain(q.id)
    expect(corrected.mistakeResponses[q.id]).toMatchObject({answers:q.correctAnswers,submitted:true,source:'practice'})
    expect(isCorrect(corrected.mistakeResponses[q.id].answers,q.correctAnswers)).toBe(true)
    const removed=removeMistake(corrected,q.id)
    expect(removed.mistakes).not.toContain(q.id)
    expect(removed.mistakeResponses[q.id]).toBeUndefined()
    expect(removed.history).toEqual(corrected.history)
    expect(removed.practice).toEqual(corrected.practice)
    expect(parseState(JSON.stringify(removed)).mistakes).toEqual([])
  })
  it.each(['1.0.0','1.0.1'])('keeps mistake retries separate from ordinary practice in bank %s',(practiceVersion)=>{
    const oldQuestion=bank.questions[0]
    const currentQuestion={...oldQuestion,correctAnswers:['A']}
    let state=submitPracticeAnswer(freshState(),currentQuestion,['A'],practiceVersion)
    const active=newExam('A')
    active.answers[oldQuestion.id]=['B']
    state=finishState({...state,activeExam:active},bank.questions,2000)
    const before=structuredClone(state.practice)
    const retry=updatePracticeAnswer(state,oldQuestion.id,[],bank.bankVersion,true)
    expect(retry.practice).toEqual(before)
    expect(retry.mistakeResponses[oldQuestion.id]).toMatchObject({answers:[],submitted:false,bankVersion:bank.bankVersion})
    const draft=updatePracticeAnswer(retry,oldQuestion.id,oldQuestion.correctAnswers,bank.bankVersion,true)
    expect(draft.practice).toEqual(before)
    const corrected=submitPracticeAnswer(draft,oldQuestion,oldQuestion.correctAnswers,bank.bankVersion,true)
    expect(corrected.practice).toEqual(before)
    expect(isCorrect(corrected.practice.answers[oldQuestion.id],currentQuestion.correctAnswers)).toBe(true)
    expect(corrected.mistakeResponses[oldQuestion.id]).toMatchObject({answers:oldQuestion.correctAnswers,submitted:true,bankVersion:bank.bankVersion})
    expect(importStudy(exportStudy(corrected))).toEqual(corrected)
    expect(state.practice).toEqual(before)
  })
  it('ignores stale review actions after another window removes the mistake',()=>{
    const q=bank.questions[0]
    const state=submitPracticeAnswer(freshState(),q,['A'],bank.bankVersion)
    const removed=removeMistake(state,q.id)
    expect(updatePracticeAnswer(removed,q.id,['B'],bank.bankVersion,true)).toBe(removed)
    expect(submitPracticeAnswer(removed,q,['B'],bank.bankVersion,true)).toBe(removed)
    expect(importStudy(exportStudy(removed))).toEqual(removed)
  })
})

describe('legacy mistake-answer recovery and validation',()=>{
  it('recovers the most recent exam answer, including multi-choice, without changing ordinary practice',()=>{
    const old=startAttempt('B',bank.questions,1000), latest=startAttempt('B',bank.questions,3000)
    const multi=bank.questions.find(q=>q.paper==='B'&&!q.supplementary&&q.selectionCount>1)!
    old.answers={'B-1':['A'],[multi.id]:['A','C']}
    latest.answers={'B-1':['D'],[multi.id]:['B','E']}
    const state={...freshState(),mistakes:['B-1',multi.id],history:[
      {...old,status:'completed' as const,endedAt:2000},
      {...latest,status:'completed' as const,endedAt:4000},
    ]}
    state.practice.answers={'B-1':['A']};state.practice.submitted={'B-1':true}
    const recovered=parseState(JSON.stringify(withoutResponses(state)))
    expect(recovered.mistakeResponses['B-1']).toMatchObject({answers:['D'],submitted:true,source:'exam',attemptId:latest.id})
    expect(recovered.mistakeResponses[multi.id].answers).toEqual(['B','E'])
    expect(recovered.practice).toEqual(state.practice)
    expect(recovered.history).toEqual(state.history)
    expect(parseState(JSON.stringify(recovered))).toEqual(recovered)
    expect(importStudy(exportStudy(recovered))).toEqual(recovered)
  })
  it('keeps deliberate retries and practice-only answers and never re-adds removed or unanswered questions',()=>{
    const active=newExam('A');active.answers={'A-1':['A'],'A-2':['B'],'A-4':[]}
    const state={...freshState(),mistakes:['A-1','A-3','A-4'],history:[{...active,status:'completed' as const,endedAt:2000}]}
    state.practice.answers={'A-1':[],'A-3':['C']};state.practice.submitted={'A-1':false,'A-3':true}
    const recovered=parseState(JSON.stringify(withoutResponses(state)))
    expect(recovered.mistakeResponses['A-1']).toMatchObject({answers:[],submitted:false,source:'practice'})
    expect(recovered.mistakeResponses['A-3']).toMatchObject({answers:['C'],submitted:true,source:'practice'})
    expect(recovered.mistakeResponses['A-2']).toBeUndefined()
    expect(recovered.mistakeResponses['A-4']).toBeUndefined()
    expect(recovered.mistakes).toEqual(state.mistakes)
  })
  it('rejects damaged mistake responses while keeping the existing state intact',()=>{
    const q=bank.questions[0]
    const state=submitPracticeAnswer(freshState(),q,['A'],bank.bankVersion)
    state.mistakes=[q.id]
    const original=structuredClone(state)
    const response={answers:['A'],submitted:true,source:'exam',bankVersion:'1.0.0'}
    for(const item of [{...response,answers:'A'},{...response,answers:['Z']},{...response,submitted:'yes'},
      {...response,source:'other'},{...response,bankVersion:'invalid'},{...response,attemptId:5}]) {
      expect(()=>parseState(JSON.stringify({...state,mistakeResponses:{[q.id]:item}}))).toThrow()
    }
    expect(()=>parseState(JSON.stringify({...freshState(),mistakeResponses:{[q.id]:response}}))).toThrow()
    expect(state).toEqual(original)
  })
  it('loads the original bank for mistake reviews even when no exam history references it',async()=>{
    const state={...freshState(),mistakes:['A-1'],mistakeResponses:{'A-1':{answers:['A'],submitted:true,bankVersion:'1.0.1',source:'practice' as const}}}
    const historical={...bank,bankVersion:'1.0.1'}
    const loader=vi.fn(async()=>historical)
    expect(await loadStudyBanks(state,loader)).toEqual({'1.0.1':historical})
    expect(loader).toHaveBeenCalledWith('1.0.1')
  })
})
