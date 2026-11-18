import {describe,expect,it,vi} from 'vitest'
import {abandonState,finishState,freshState,getResult,parseState,setExamFlag,setExamOption,setPracticeOption,startAttempt,submitLatestPracticeAnswer,submitPracticeAnswer,updatePracticeAnswer} from '../src/core'
import {StudyPersistence,type StudyLock} from '../src/persistence'
import {exportStudy,importStudy} from '../src/transfer'
import {restoreStudyState} from '../src/banks'
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

describe('queued answer intents',()=>{
  it('keeps the same answer selected when two windows both select it',async()=>{
    const storage=sharedStorage(),a=storage.connect(),b=storage.connect(),q=bank.questions[0]
    await Promise.all([
      a.update(s=>setPracticeOption(s,q,'A',true,bank.bankVersion)),
      b.update(s=>setPracticeOption(s,q,'A',true,bank.bankVersion)),
    ])
    expect(storage.read().practice.answers[q.id]).toEqual(['A'])
    // A subsequent user action can still deliberately uncheck the answer.
    await a.update(s=>setPracticeOption(s,q,'A',false,bank.bankVersion))
    expect(storage.read().practice.answers[q.id]).toEqual([])
  })
  it('merges different multiple-choice selections while making repeats idempotent',async()=>{
    const storage=sharedStorage(),a=storage.connect(),b=storage.connect()
    const q=bank.questions.find(q=>q.selectionCount>1)!
    await Promise.all([
      a.update(s=>setPracticeOption(s,q,'A',true,bank.bankVersion)),
      b.update(s=>setPracticeOption(s,q,'B',true,bank.bankVersion)),
      a.update(s=>setPracticeOption(s,q,'A',true,bank.bankVersion)),
    ])
    expect([...storage.read().practice.answers[q.id]].sort()).toEqual(['A','B'])
    await b.update(s=>setPracticeOption(s,q,'A',false,bank.bankVersion))
    expect(storage.read().practice.answers[q.id]).toEqual(['B'])
  })
  it('does not cancel matching exam choices or flags from concurrent windows',async()=>{
    const initial=activeState(),id=initial.activeExam.id,q=bank.questions[0]
    const storage=sharedStorage(initial),a=storage.connect(),b=storage.connect()
    await Promise.all([
      a.update(s=>setExamOption(s,id,q,'A',true,2000)),
      b.update(s=>setExamOption(s,id,q,'A',true,2000)),
      a.update(s=>setExamFlag(s,id,q.id,true,2001)),
      b.update(s=>setExamFlag(s,id,q.id,true,2001)),
    ])
    expect(storage.read().activeExam?.answers[q.id]).toEqual(['A'])
    expect(storage.read().activeExam?.flags).toEqual([q.id])
    await a.update(s=>setExamFlag(s,id,q.id,false,2002))
    expect(storage.read().activeExam?.flags).toEqual([])
  })
  it.each([false,true])('submits the latest queued draft (mistake review: %s)',async reviewing=>{
    const q=bank.questions[0]
    let initial=freshState()
    if(reviewing)initial=submitPracticeAnswer(initial,q,['A'],bank.bankVersion)
    initial=updatePracticeAnswer(initial,q.id,['A'],bank.bankVersion,reviewing)
    const storage=sharedStorage(initial),a=storage.connect()
    const choose=a.update(s=>setPracticeOption(s,q,'C',true,bank.bankVersion,reviewing))
    const submit=a.update(s=>submitLatestPracticeAnswer(s,q,bank.bankVersion,reviewing))
    // The UI can immediately render/export accepted input before lock acquisition.
    const projected=a.read()
    expect(reviewing?projected.mistakeResponses[q.id].answers:projected.practice.answers[q.id]).toEqual(['C'])
    await Promise.all([choose,submit])
    const state=storage.read()
    expect(reviewing?state.mistakeResponses[q.id].answers:state.practice.answers[q.id]).toEqual(['C'])
    expect(reviewing?state.mistakeResponses[q.id].submitted:state.practice.submitted[q.id]).toBe(true)
    expect(setPracticeOption(state,q,'A',true,bank.bankVersion,reviewing)).toBe(state)
    expect(submitLatestPracticeAnswer(state,q,bank.bankVersion,reviewing)).toBe(state)
  })
  it('does not acknowledge later updates before an import/reset barrier',async()=>{
    const storage=sharedStorage(),a=storage.connect(),[q1,q2]=bank.questions
    const first=a.update(s=>setPracticeOption(s,q1,'A',true,bank.bankVersion))
    const replace=a.replace(freshState())
    const second=a.update(s=>setPracticeOption(s,q2,'B',true,bank.bankVersion))
    await Promise.all([first,replace,second])
    expect(storage.read().practice.answers).toEqual({[q2.id]:['B']})
    const firstWrite=parseState(storage.write.mock.calls[0][0])
    expect(firstWrite.practice.answers).toEqual({[q1.id]:['A']})
    expect(a.read()).toEqual(storage.read())
  })
  it('keeps pre-deadline failed input after time advances, in backups, and in the final score',async()=>{
    const initial=activeState(),active=initial.activeExam,q=bank.questions[0]
    const storage=sharedStorage(initial),a=storage.connect()
    const occurredAt=active.deadline-1
    const clock=vi.spyOn(Date,'now').mockReturnValue(occurredAt)
    try {
      storage.write.mockImplementationOnce(()=>{throw new Error('storage full')})
      await expect(a.update(s=>setExamOption(s,active.id,q,'C',true,occurredAt))).rejects.toThrow('storage full')
      expect(a.read().activeExam?.answers[q.id]).toEqual(['C'])
      clock.mockReturnValue(active.deadline+10000)
      expect(a.read().activeExam?.answers[q.id]).toEqual(['C'])
      const backup=importStudy(exportStudy(a.read()))
      const restored=await restoreStudyState(backup,async()=>bank,active.deadline+10000)
      expect(getResult(restored.state.history[0],bank.questions).score).toBe(1)
      const settledAt=Date.now()
      await a.update(s=>finishState(s,bank.questions,settledAt))
      expect(storage.read().history[0].answers[q.id]).toEqual(['C'])
      expect(getResult(storage.read().history[0],bank.questions).score).toBe(1)
      expect(storage.read().history[0].endedAt).toBe(active.deadline)
    } finally {clock.mockRestore()}
  })
  it('accepts input that waited for the lock across the deadline and rejects input made at the deadline',async()=>{
    const initial=activeState(),active=initial.activeExam,q=bank.questions[0]
    let release!:()=>void
    const gate=new Promise<void>(resolve=>{release=resolve})
    let raw=JSON.stringify(initial)
    const lock:StudyLock=async operation=>{await gate;return operation()}
    const a=new StudyPersistence(()=>raw,value=>{raw=value},lock)
    const accepted=a.update(s=>setExamOption(s,active.id,q,'C',true,active.deadline-1))
    expect(a.read().activeExam?.answers[q.id]).toEqual(['C'])
    const late=a.update(s=>setExamOption(s,active.id,q,'A',true,active.deadline))
    expect(a.read().activeExam?.answers[q.id]).toEqual(['C'])
    release()
    await Promise.all([accepted,late])
    expect(parseState(raw).activeExam?.answers[q.id]).toEqual(['C'])
    const snapshot=a.read()
    expect(setExamFlag(snapshot,active.id,q.id,true,active.deadline)).toBe(snapshot)
  })
  it('does not change the submission time when an unsaved completion is read or retried later',async()=>{
    const initial=activeState(),storage=sharedStorage(initial),a=storage.connect()
    const submittedAt=2000
    const clock=vi.spyOn(Date,'now').mockReturnValue(submittedAt)
    try {
      storage.write.mockImplementationOnce(()=>{throw new Error('storage full')})
      await expect(a.update(s=>finishState(s,bank.questions,submittedAt))).rejects.toThrow('storage full')
      clock.mockReturnValue(30000)
      expect(a.read().history[0].endedAt).toBe(submittedAt)
      expect(a.read().history[0].endedAt).toBe(submittedAt)
      await a.update(s=>setPracticeOption(s,bank.questions[0],'C',true,bank.bankVersion))
      expect(storage.read().history[0].endedAt).toBe(submittedAt)
    } finally {clock.mockRestore()}
  })
})
