import {createContext, useContext, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction} from 'react'
import {finishState, freshState, parseState, STORAGE_KEY} from './core'
import {attemptBankVersion, loadBank, restoreStudyState, studyBankVersions} from './banks'
import type {Attempt, Bank, Question, StudyState} from './types'

interface StudyContext {bank: Bank; state: StudyState; setState: Dispatch<SetStateAction<StudyState>>; replaceState: (next: StudyState) => Promise<void>; getAttemptBank: (attempt: Attempt) => Bank; mistakeQuestions: Question[]; storageError: string; dismissError: () => void}
const Context = createContext<StudyContext | null>(null)
export const useStudy = () => {const value = useContext(Context); if (!value) throw new Error('Missing study provider'); return value}

export function StudyProvider({bank, children}: {bank: Bank; children: ReactNode}) {
  const [initial] = useState(() => {try {return {state: parseState(localStorage.getItem(STORAGE_KEY)), error: ''}} catch (e) {return {state: freshState(), error: String(e)}}})
  const [state,setState] = useState(initial.state)
  const [storageError,setStorageError] = useState(initial.error)
  const [blocked,setBlocked] = useState(!!initial.error)
  const [banks,setBanks] = useState<Record<string,Bank>>({[bank.bankVersion]:bank})
  const [bankError,setBankError] = useState('')
  const [retry,setRetry] = useState(0)
  let versions: string[] = [], versionError = ''
  try {
    versions=studyBankVersions(state)
  } catch(e) {versionError=e instanceof Error?e.message:'无法识别记录的题库版本。'}
  const versionsKey=versions.join(',')
  const waiting=versions.some(version=>!banks[version])
  const mistakeQuestions=useMemo(()=>state.mistakes.map(id=>(banks[state.mistakeResponses[id]?.bankVersion]||bank).questions.find(q=>q.id===id)).filter((q):q is Question=>!!q),[state.mistakes,state.mistakeResponses,banks,bank])
  useEffect(()=>{
    let cancelled=false
    setBankError('')
    const missing=versions.filter(version=>!banks[version])
    if(missing.length) Promise.all(missing.map(async version=>[version,await loadBank(version)] as const))
      .then(entries=>{if(!cancelled)setBanks(current=>({...current,...Object.fromEntries(entries)}))})
      .catch(e=>{if(!cancelled)setBankError(e instanceof Error?e.message:'历史题库加载失败。')})
    return()=>{cancelled=true}
  },[versionsKey,retry])
  useEffect(() => {
    if (blocked) return
    try {localStorage.setItem(STORAGE_KEY, JSON.stringify(state))}
    catch {setStorageError('浏览器未能保存学习记录，请检查存储权限或剩余空间。当前页面仍可继续答题。')}
  }, [state, blocked])
  useEffect(() => {
    const check = () => setState(s => {
      if(!s.activeExam||Date.now()<s.activeExam.deadline)return s
      try {
        const source=banks[attemptBankVersion(s.activeExam)]
        return source?finishState(s,source.questions):s
      } catch {return s}
    })
    check()
    const timer = window.setInterval(check,1000)
    window.addEventListener('focus',check)
    return () => {clearInterval(timer); window.removeEventListener('focus',check)}
  }, [banks])
  useEffect(() => {
    const update = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return
      try {setState(parseState(event.newValue))} catch {setStorageError('另一窗口的学习记录无法读取，请刷新并检查本地记录。');setBlocked(true)}
    }
    window.addEventListener('storage',update)
    return () => window.removeEventListener('storage',update)
  }, [])
  async function replaceState(next: StudyState) {
    // Load and verify all required snapshots before replacing any local records.
    const {state:restored,banks:restoredBanks}=await restoreStudyState(next)
    try {localStorage.setItem(STORAGE_KEY, JSON.stringify(restored))}
    catch {throw new Error('浏览器未能保存导入记录，请检查存储权限或剩余空间。')}
    setBanks(current=>({...current,...restoredBanks}))
    setState(restored)
    setBlocked(false)
    setStorageError('')
  }
  if(waiting||versionError||bankError)return <div className="loading-page"><h1>{versionError||bankError?'暂时无法加载历史题库':'正在恢复考试记录…'}</h1><p>{versionError||bankError||'正在准备对应版本的题目与解析。'}</p>{(versionError||bankError)&&<><button className="button primary" onClick={()=>setRetry(n=>n+1)}>重试</button><button className="button secondary" onClick={()=>{
    const url=URL.createObjectURL(new Blob([localStorage.getItem(STORAGE_KEY)||'{}'],{type:'application/json'}))
    const link=document.createElement('a');link.href=url;link.download='istqb-study-recovery.json';link.click();URL.revokeObjectURL(url)
  }}>下载学习记录备份</button></>}</div>
  return <Context.Provider value={{bank,state,setState,replaceState,getAttemptBank:attempt=>banks[attemptBankVersion(attempt)],mistakeQuestions,storageError,dismissError:()=>{if(!blocked)setStorageError('')}}}>{children}</Context.Provider>
}
