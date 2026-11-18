import {describe, expect, it} from 'vitest'
import {readFileSync} from 'node:fs'
import {abandonState, EXAM_DURATION, finishState, freshState, startAttempt} from '../src/core'
import {exportStudy, importStudy, MAX_BACKUP_BYTES, MAX_BACKUP_CODE_LENGTH} from '../src/transfer'
import type {Bank, StudyState} from '../src/types'

const bank: Bank=JSON.parse(readFileSync(new URL('../public/data/questions.json',import.meta.url),'utf8'))
function populated(): StudyState {
  const completed=startAttempt('A',bank.questions,1000)
  completed.id='中文记录 🧪'
  completed.answers={'A-1':['B']}
  const state=finishState({...freshState(),activeExam:completed},bank.questions,2000)
  state.activeExam=startAttempt('D',bank.questions,3000)
  state.activeExam.answers={'D-20':['E','B']}
  state.activeExam.flags=['D-20'];state.activeExam.index=19
  state.practice={filter:'chapter:4',index:8,answers:{'A-A1':['C']},submitted:{'A-A1':true}}
  return state
}

describe('abandon exam',()=>{
  it('discards only the active attempt, without grading or changing existing records',()=>{
    const state=populated()
    const snapshot=structuredClone(state)
    const abandoned=abandonState(state)
    expect(abandoned.activeExam).toBeNull()
    expect(abandoned.history).toEqual(snapshot.history)
    expect(abandoned.mistakes).toEqual(snapshot.mistakes)
    expect(abandoned.practice).toEqual(snapshot.practice)
    expect(state).toEqual(snapshot)
    expect(abandonState(abandoned)).toBe(abandoned)
    expect(finishState(abandoned,bank.questions)).toBe(abandoned)
    expect(startAttempt('D',bank.questions,5000).deadline).toBe(5000+EXAM_DURATION)
  })
})

describe('LZ4 copy/paste backup',()=>{
  it.each([freshState(),populated()])('round-trips all learning records, Unicode, multi-choice and fixed exam times',state=>{
    const code=exportStudy(state)
    expect(code.startsWith('ISTQB-LZ4-v1:')).toBe(true)
    const frame=Uint8Array.from(atob(code.split(':')[3]),c=>c.charCodeAt(0))
    expect(Array.from(frame.subarray(0,4))).toEqual([4,34,77,24])
    expect(importStudy(code)).toEqual(state)
    expect(importStudy(` \n${code.replace(/(.{70})/g,'$1\n')}\n `)).toEqual(state)
  })
  it('preserves an expired deadline for normal automatic settlement, never restarting the timer',()=>{
    const before=populated()
    const after=importStudy(exportStudy(before))
    expect(after.activeExam?.deadline).toBe(before.activeExam?.deadline)
    const settled=finishState(after,bank.questions,Date.now())
    expect(settled.history[0].endedAt).toBe(before.activeExam?.deadline)
    expect(settled.history).toHaveLength(before.history.length+1)
  })
  it('rejects truncated, corrupted, unsupported and oversized input without mutating existing records',()=>{
    const state=populated(), original=structuredClone(state)
    const code=exportStudy(state), parts=code.split(':')
    const invalid=[
      '', JSON.stringify(state), code.slice(0,-8), code.replace('v1:', 'v2:'),
      [parts[0],parts[1],'00000000',parts[3]].join(':'),
      [parts[0],Number(parts[1])+1,parts[2],parts[3]].join(':'),
      [parts[0],MAX_BACKUP_BYTES+1,parts[2],parts[3]].join(':'),
      [parts[0],parts[1],parts[2],'!!!!'].join(':'), 'x'.repeat(MAX_BACKUP_CODE_LENGTH+1),
    ]
    for(const value of invalid) expect(()=>importStudy(value)).toThrow()
    expect(state).toEqual(original)
  })
  it.each([
    [255], // truncated block-size field
    [1,0,0,0,255], // unterminated literal length
    [3,0,0,0,0,0,0], // zero match distance
    [3,0,0,0,0,255,255], // match preceding all output
    [1,0,0,128,65], // absent end marker
    [0,0,0,0,1], // trailing bytes
    [255,255,255,127], // oversized block
  ])('bounds malformed LZ4 frames before decoding: %j',(...tail:number[])=>{
    const bytes=Uint8Array.from([4,34,77,24,64,112,223,...tail])
    const code=`ISTQB-LZ4-v1:1:00000000:${btoa(String.fromCharCode(...bytes))}`
    expect(()=>importStudy(code)).toThrow()
  })
  it('handles records spanning multiple LZ4 blocks within the size limit',()=>{
    const state=populated()
    state.history[0].id='跨块中文🧪'.repeat(300000)
    const code=exportStudy(state)
    expect(importStudy(code)).toEqual(state)
  })
})
