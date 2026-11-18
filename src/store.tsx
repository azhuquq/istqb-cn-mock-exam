import {createContext, useContext, useEffect, useState, type Dispatch, type ReactNode, type SetStateAction} from 'react'
import {finishState, freshState, parseState, STORAGE_KEY} from './core'
import type {Bank, StudyState} from './types'

interface StudyContext {bank: Bank; state: StudyState; setState: Dispatch<SetStateAction<StudyState>>; replaceState: (next: StudyState) => void; storageError: string; dismissError: () => void}
const Context = createContext<StudyContext | null>(null)
export const useStudy = () => {const value = useContext(Context); if (!value) throw new Error('Missing study provider'); return value}

export function StudyProvider({bank, children}: {bank: Bank; children: ReactNode}) {
  const [initial] = useState(() => {try {return {state: parseState(localStorage.getItem(STORAGE_KEY)), error: ''}} catch (e) {return {state: freshState(), error: String(e)}}})
  const [state,setState] = useState(initial.state)
  const [storageError,setStorageError] = useState(initial.error)
  const [blocked,setBlocked] = useState(!!initial.error)
  useEffect(() => {
    if (blocked) return
    try {localStorage.setItem(STORAGE_KEY, JSON.stringify(state))}
    catch {setStorageError('浏览器未能保存学习记录，请检查存储权限或剩余空间。当前页面仍可继续答题。')}
  }, [state, blocked])
  useEffect(() => {
    const check = () => setState(s => s.activeExam && Date.now() >= s.activeExam.deadline ? finishState(s,bank.questions) : s)
    check()
    const timer = window.setInterval(check,1000)
    window.addEventListener('focus',check)
    return () => {clearInterval(timer); window.removeEventListener('focus',check)}
  }, [bank])
  useEffect(() => {
    const update = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return
      try {setState(parseState(event.newValue))} catch {setStorageError('另一窗口的学习记录无法读取，请刷新并检查本地记录。');setBlocked(true)}
    }
    window.addEventListener('storage',update)
    return () => window.removeEventListener('storage',update)
  }, [])
  function replaceState(next: StudyState) {
    const validated = parseState(JSON.stringify(next))
    const restored = validated.activeExam && Date.now() >= validated.activeExam.deadline ? finishState(validated, bank.questions) : validated
    // Persist first: if storage rejects the import, retain the current state.
    try {localStorage.setItem(STORAGE_KEY, JSON.stringify(restored))}
    catch {throw new Error('浏览器未能保存导入记录，请检查存储权限或剩余空间。')}
    setState(restored)
    setBlocked(false)
    setStorageError('')
  }
  return <Context.Provider value={{bank,state,setState,replaceState,storageError,dismissError:()=>{if(!blocked)setStorageError('')}}}>{children}</Context.Provider>
}
