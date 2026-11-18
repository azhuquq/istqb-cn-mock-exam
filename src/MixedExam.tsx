import {useEffect, useRef, useState} from 'react'
import {Link, useNavigate, useSearchParams} from 'react-router-dom'
import {ArrowRight, Copy, ExternalLink, Play, Shuffle} from 'lucide-react'
import {CHAPTERS, examName, startMixedAttempt} from './core'
import {bankFingerprint, MIXED_QUOTAS, randomMixedSeed, STRUCTURE_URL, type MixedPaper} from './mixed'
import {generateFromSeed} from './banks'
import {useStudy} from './store'

export function SeedControl({seed}: {seed: string}) {
  const input = useRef<HTMLInputElement>(null)
  const [notice,setNotice] = useState('')
  useEffect(() => setNotice(''),[seed])
  async function copy() {
    // Select synchronously as a fallback for mobile browsers that deny clipboard access.
    input.current?.focus({preventScroll:true})
    input.current?.select()
    input.current?.setSelectionRange(0,seed.length)
    let modern: Promise<boolean> | undefined
    try {modern = navigator.clipboard?.writeText(seed).then(() => true,() => false)} catch {}
    let legacy = false
    try {legacy = document.execCommand('copy')} catch {}
    if (legacy || await modern) setNotice('生成种子已复制。')
    else setNotice('种子已选中，请手动复制或长按拷贝。')
  }
  return <div className="seed-control">
    <label>本套试卷的生成种子
      <input ref={input} value={seed} readOnly onFocus={e=>e.currentTarget.select()} spellCheck={false} aria-label="本套试卷的生成种子"/>
    </label>
    <button type="button" className="button secondary" onClick={copy}><Copy size={15}/>复制生成种子</button>
    {notice&&<p role="status">{notice}</p>}
  </div>
}

export function MixedPage() {
  const {bank,state,setState} = useStudy()
  const [params,setParams] = useSearchParams()
  const navigate = useNavigate()
  const [fingerprint,setFingerprint] = useState('')
  const [input,setInput] = useState(params.get('seed') || '')
  const [paper,setPaper] = useState<MixedPaper|null>(null)
  const [error,setError] = useState('')
  const [generating,setGenerating] = useState(false)
  const generation = useRef(0)
  const requested = params.get('seed') || ''
  useEffect(() => {
    let cancelled = false
    bankFingerprint(bank).then(value=>{if(!cancelled)setFingerprint(value)}).catch(()=>{
      if(!cancelled)setError('无法初始化题库，请使用 HTTPS 或本机 localhost 访问后重试。')
    })
    return () => {cancelled = true}
  },[bank])
  useEffect(() => {
    if (!requested) return
    void generate(requested,false)
    return () => {generation.current++}
  },[requested])
  async function generate(seed: string, updateUrl = true) {
    const request = ++generation.current
    setGenerating(true)
    try {
      const next=await generateFromSeed(seed)
      if(request!==generation.current)return
      setPaper(next);setInput(next.seed);setError('')
      if(updateUrl)setParams({seed:next.seed},{replace:true})
    } catch(e) {if(request===generation.current)setError(e instanceof Error ? e.message : '无法生成试卷，请重试。')}
    finally {if(request===generation.current)setGenerating(false)}
  }
  function start() {
    if (!paper || generating || state.activeExam) return
    const attempt = startMixedAttempt(paper)
    setState(s=>s.activeExam?s:{...s,activeExam:attempt})
    navigate('/exam/mixed')
  }
  return <>
    <div className="page-heading"><div><div className="eyebrow">A FRESH MIX, THE SAME STANDARD</div><h1>混合模拟<span className="heading-dot">.</span></h1><p>从全部 186 道题中随机组卷，包含 A 卷 26 道附加题。</p></div></div>
    <div className="mixed-grid">
      <section className="panel mixed-setup">
        <h2>给自己一套新的挑战</h2>
        <p>40 题 · 60 分钟 · 26 分及格。每章的知识级别与学习目标组均按官方配额抽取。</p>
        <button className="button primary" disabled={!fingerprint||generating} onClick={()=>generate(randomMixedSeed(fingerprint,bank.bankVersion))}><Shuffle size={16}/>{generating?'正在准备试卷…':paper?'重新随机生成':'随机生成试卷'}</button>
        <form onSubmit={e=>{e.preventDefault();generate(input)}}>
          <label htmlFor="mixed-seed">使用生成种子复用试卷</label>
          <input id="mixed-seed" value={input} onChange={e=>setInput(e.target.value)} maxLength={100} placeholder="M1-1-…（也支持旧格式）" autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false}/>
          <button className="button secondary" disabled={generating||!input.trim()}>复用这套试卷 <ArrowRight size={15}/></button>
        </form>
        <p>相同种子复现相同题目和顺序，每次开考单独计时。复用时会自动加载种子对应的已发布题库和算法版本。</p>
        {error&&<p className="mixed-error" role="alert">{error}</p>}
        {paper&&<div className="mixed-ready">
          <h3>试卷已生成，准备好再开始</h3>
          <p>已抽取 40 道不同题目，满足官方全部配额。点击开始考试后计时。</p>
          <SeedControl seed={paper.seed}/>
          {!state.activeExam&&<button className="button primary" disabled={generating} onClick={start}><Play size={15}/>开始混合模拟</button>}
        </div>}
        {state.activeExam&&<div className="existing-exam-note"><p>你有一场{examName(state.activeExam.paper)}正在进行，请先完成或放弃当前考试。</p><Link className="button primary" to={`/exam/${state.activeExam.paper}`}>继续考试 <ArrowRight size={15}/></Link></div>}
      </section>
      <section className="panel mixed-structure">
        <h2>每套试卷的固定配额</h2>
        <p>按章节与知识级别分配，同时满足 29 个学习目标组的覆盖要求。</p>
        <table><caption className="sr-only">官方章节与知识级别题量配额</caption><thead><tr><th scope="col">章节</th><th scope="col">K1</th><th scope="col">K2</th><th scope="col">K3</th><th scope="col">合计</th></tr></thead>
          <tbody>{MIXED_QUOTAS.map((counts,i)=><tr key={i}><th scope="row"><span>第 {i+1} 章</span>{CHAPTERS[i]}</th>{counts.map((n,j)=><td key={j}>{n}</td>)}<td>{counts.reduce<number>((a,b)=>a+b,0)}</td></tr>)}</tbody>
          <tfoot><tr><th scope="row">合计</th><td>8</td><td>24</td><td>8</td><td>40</td></tr></tfoot>
        </table>
        <a className="text-link" href={STRUCTURE_URL} target="_blank" rel="noreferrer">ISTQB 官方考试结构表 v1.18 <ExternalLink size={14}/></a>
      </section>
    </div>
  </>
}
