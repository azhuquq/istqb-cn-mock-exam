import {describe,expect,it,vi} from 'vitest'
import {abandonState,finishState,freshState,parseState,startAttempt,submitPracticeAnswer,updatePracticeAnswer} from '../src/core'
import {StudyPersistence,type StudyLock} from '../src/persistence'
import {readFileSync} from 'node:fs'
import type {Bank,StudyState} from '../src/types'

const bank:Bank=JSON.parse(readFileSync(new URL('../public/data/questions.json',import.meta.url),'utf8'))
function sharedStorage(initial:StudyState=freshState()) {
  let raw=JSON.stringify(initial)
  let queue:Promise<unknown>=Promise.resolve()
  const lock:StudyLock=operation=>{
    const result=queue.then(operation)
    queue=result.catch(()=>{})
    return result
  }
  const write=vi.fn((value:string)=>{raw=value})
  const connect=()=>new StudyPersistence(()=>raw,write,lock)
  return {connect,write,read:()=>parseState(raw),raw:()=>raw}
}
function activeState() {return {...freshState(),activeExam:startAttempt('A',bank.questions,1000)}}

describe('transactional cross-window persistence',()=>{
  it('preserves simultaneous answers to different questions from multiple windows',async()=>{
    const storage=sharedStorage(),tabs=[storage.connect(),storage.connect()]
    await Promise.all(bank.questions.slice(0,20).map((q,i)=>tabs[i%2].update(s=>submitPracticeAnswer(s,q,['A'],bank.bankVersion))))
    const state=storage.read()
    expect(Object.keys(state.practice.answers)).toHaveLength(20)
    for(const q of bank.questions.slice(0,20))expect(state.practice.answers[q.id]).toEqual(['A'])
    expect(tabs[0].read()).toEqual(tabs[1].read())
  })
  it.each([false,true])('cannot resurrect a completed exam when a stale window navigates (navigation first: %s)',async navigationFirst=>{
    const initial=activeState(),id=initial.activeExam.id
    const storage=sharedStorage(initial),a=storage.connect(),b=storage.connect()
    const navigate=()=>b.update(s=>s.activeExam?.id===id?{...s,activeExam:{...s.activeExam,index:1}}:s)
    const finish=()=>a.update(s=>s.activeExam?.id===id?finishState(s,bank.questions,2000):s)
    await Promise.all(navigationFirst?[navigate(),finish()]:[finish(),navigate()])
    expect(storage.read().activeExam).toBeNull()
    expect(storage.read().history.map(a=>a.id)).toEqual([id])
    await navigate()
    expect(a.read()).toEqual(storage.read())
    expect(b.read()).toEqual(storage.read())
  })
  it('settles simultaneous submissions exactly once and never revives an abandoned attempt',async()=>{
    const initial=activeState(),storage=sharedStorage(initial),a=storage.connect(),b=storage.connect()
    await Promise.all([a.update(s=>finishState(s,bank.questions,2000)),b.update(s=>finishState(s,bank.questions,2001))])
    expect(storage.read().history).toHaveLength(1)
    const second=startAttempt('B',bank.questions,3000)
    await a.update(s=>({...s,activeExam:second}))
    await Promise.all([
      a.update(s=>s.activeExam?.id===second.id?abandonState(s):s),
      b.update(s=>s.activeExam?.id===second.id?{...s,activeExam:{...s.activeExam,index:2}}:s),
    ])
    expect(storage.read().activeExam).toBeNull()
    expect(storage.read().history).toHaveLength(1)
  })
  it('allows only one concurrent exam start',async()=>{
    const storage=sharedStorage(),a=storage.connect(),b=storage.connect()
    const first=startAttempt('A',bank.questions,1000),second=startAttempt('B',bank.questions,1000)
    await Promise.all([
      a.update(s=>s.activeExam?s:{...s,activeExam:first}),
      b.update(s=>s.activeExam?s:{...s,activeExam:second}),
    ])
    expect(storage.read().activeExam?.id).toBe(first.id)
    expect(a.read().activeExam?.id).toBe(b.read().activeExam?.id)
  })
  it('reads the latest stored state without echoing delayed storage notifications',async()=>{
    const storage=sharedStorage(),a=storage.connect(),b=storage.connect()
    await a.update(s=>submitPracticeAnswer(s,bank.questions[0],['A'],bank.bankVersion))
    const obsolete=storage.raw()
    await b.update(s=>submitPracticeAnswer(s,bank.questions[1],['B'],bank.bankVersion))
    expect(obsolete).not.toBe(storage.raw())
    const writes=storage.write.mock.calls.length
    expect(a.read().practice.answers).toEqual({'A-1':['A'],'A-2':['B']})
    expect(b.read()).toEqual(a.read())
    expect(storage.write).toHaveBeenCalledTimes(writes)
  })
  it('serializes import/reset and makes stale exam actions harmless after replacement',async()=>{
    const initial=activeState(),storage=sharedStorage(initial),a=storage.connect(),b=storage.connect()
    const id=initial.activeExam.id
    const replacement=submitPracticeAnswer(freshState(),bank.questions[2],['C'],bank.bankVersion)
    await a.replace(replacement)
    await b.update(s=>s.activeExam?.id===id?finishState(s,bank.questions,2000):s)
    expect(storage.read()).toEqual(replacement)
    await a.update(()=>freshState())
    expect(b.read()).toEqual(freshState())
  })
  it('keeps failed edits in memory and retries all pending edits without losing another window’s work',async()=>{
    const storage=sharedStorage(),a=storage.connect(),b=storage.connect()
    storage.write.mockImplementationOnce(()=>{throw new Error('storage full')})
    await expect(a.update(s=>updatePracticeAnswer(s,'A-1',['A'],bank.bankVersion))).rejects.toThrow('storage full')
    expect(a.read().practice.answers['A-1']).toEqual(['A'])
    expect(storage.read().practice.answers['A-1']).toBeUndefined()
    await b.update(s=>updatePracticeAnswer(s,'A-2',['B'],bank.bankVersion))
    await a.update(s=>submitPracticeAnswer(s,bank.questions[0],['A'],bank.bankVersion))
    expect(storage.read().practice.answers).toEqual({'A-1':['A'],'A-2':['B']})
    expect(storage.read().practice.submitted['A-1']).toBe(true)
  })
  it('does not change records when replacement fails',async()=>{
    const storage=sharedStorage(activeState()),a=storage.connect(),before=storage.raw()
    storage.write.mockImplementationOnce(()=>{throw new Error('storage full')})
    await expect(a.replace(freshState())).rejects.toThrow('storage full')
    expect(storage.raw()).toBe(before)
  })
})
