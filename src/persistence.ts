import {parseState, STORAGE_KEY} from './core'
import type {StudyState} from './types'

export type StudyUpdate = (state: StudyState) => StudyState
export type StudyLock = <T>(operation: () => T) => Promise<T>

let lockDatabase: Promise<IDBDatabase> | undefined
function openLockDatabase() {
  return lockDatabase ||= new Promise<IDBDatabase>((resolve,reject)=>{
    const request=indexedDB.open('istqb-study-coordination',1)
    request.onupgradeneeded=()=>request.result.createObjectStore('writes')
    request.onsuccess=()=>resolve(request.result)
    request.onerror=()=>reject(request.error)
    request.onblocked=()=>reject(new Error('无法协调其他窗口的保存操作，请关闭旧窗口后重试。'))
  }).catch(error=>{lockDatabase=undefined;throw error})
}

// Every writer reads and updates localStorage inside the same origin-wide lock.
// IndexedDB read/write transactions provide the fallback for browsers without
// Web Locks; no learning records are stored in that database.
export async function withStudyLock<T>(operation: () => T): Promise<T> {
  if(navigator.locks)return navigator.locks.request(STORAGE_KEY,operation)
  const database=await openLockDatabase()
  return new Promise<T>((resolve,reject)=>{
    const transaction=database.transaction('writes','readwrite')
    let result:T
    transaction.objectStore('writes').get(STORAGE_KEY).onsuccess=()=>{
      try {result=operation()} catch(error){transaction.abort();reject(error)}
    }
    transaction.oncomplete=()=>resolve(result)
    transaction.onerror=()=>reject(transaction.error)
    transaction.onabort=()=>reject(transaction.error||new Error('保存操作已中止。'))
  })
}

export class StudyPersistence {
  private queue: Promise<unknown> = Promise.resolve()
  private pending: StudyUpdate[] = []
  constructor(private readRaw: () => string | null, private writeRaw: (serialized: string) => void, private lock: StudyLock = withStudyLock) {}

  // Read the current storage value, never a queued StorageEvent.newValue.
  // Failed writes remain available in memory and in exported backups.
  read(): StudyState {
    return this.pending.reduce((state,update)=>update(state),parseState(this.readRaw()))
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result=this.queue.then(operation)
    this.queue=result.catch(()=>{})
    return result
  }

  update(update: StudyUpdate): Promise<StudyState> {
    return this.enqueue(()=>{
      this.pending.push(update)
      return this.lock(()=>{
        const raw=this.readRaw()
        const next=this.pending.reduce((state,apply)=>apply(state),parseState(raw))
        const serialized=JSON.stringify(next)
        if(serialized!==raw)this.writeRaw(serialized)
        this.pending=[]
        return next
      })
    })
  }

  replace(state: StudyState): Promise<void> {
    const serialized=JSON.stringify(parseState(JSON.stringify(state)))
    return this.enqueue(()=>this.lock(()=>{
      this.writeRaw(serialized)
      this.pending=[]
    }))
  }
}
