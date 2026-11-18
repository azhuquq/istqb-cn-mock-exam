import {describe,expect,it,vi} from 'vitest'
import {freshState,submitPracticeAnswer} from '../src/core'
import {StudyPersistence} from '../src/persistence'
import {readFileSync} from 'node:fs'
import type {Bank} from '../src/types'

const bank:Bank=JSON.parse(readFileSync(new URL('../public/data/questions.json',import.meta.url),'utf8'))

describe('cross-window persistence',()=>{
  it('does not echo incoming snapshots, even with different practice ranges and queued events',()=>{
    const writeA=vi.fn(),writeB=vi.fn()
    const tabA=new StudyPersistence(writeA),tabB=new StudyPersistence(writeB)
    const a=freshState(),b=freshState()
    a.practice.index=3
    b.practice.filter='paper:B'
    tabA.save(a)
    tabB.save(b)
    // Both tabs receive the other tab's earlier write after their own save.
    const receivedA=tabA.receive(JSON.stringify(b))
    const receivedB=tabB.receive(JSON.stringify(a))
    tabA.save(receivedA)
    tabB.save(receivedB)
    expect(writeA).toHaveBeenCalledTimes(1)
    expect(writeB).toHaveBeenCalledTimes(1)
    // An actual answer change still persists and synchronizes normally.
    const answered=submitPracticeAnswer(receivedA,bank.questions[0],['A'],bank.bankVersion)
    tabA.save(answered)
    const synced=tabB.receive(writeA.mock.calls[1][0])
    tabB.save(synced)
    expect(synced.practice.answers['A-1']).toEqual(['A'])
    expect(writeA).toHaveBeenCalledTimes(2)
    expect(writeB).toHaveBeenCalledTimes(1)
  })

  it('does not echo a remote reset or legacy migration',()=>{
    const write=vi.fn(),persistence=new StudyPersistence(write)
    persistence.save(persistence.receive(null))
    const {mistakeResponses,...legacy}=freshState()
    persistence.save(persistence.receive(JSON.stringify(legacy)))
    expect(write).not.toHaveBeenCalled()
  })

  it('keeps failed writes retryable and rejects damaged remote data',()=>{
    const write=vi.fn().mockImplementationOnce(()=>{throw new Error('storage full')})
    const persistence=new StudyPersistence(write),state=freshState()
    expect(()=>persistence.save(state)).toThrow('storage full')
    expect(()=>persistence.receive('{')).toThrow()
    persistence.save(state)
    persistence.save(state)
    expect(write).toHaveBeenCalledTimes(2)
  })
})
