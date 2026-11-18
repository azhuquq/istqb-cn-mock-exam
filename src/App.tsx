import React, {useEffect, useState, type ReactNode} from 'react'
import {BrowserRouter, Link, NavLink, Route, Routes, useLocation, useNavigate, useParams, useSearchParams} from 'react-router-dom'
import {ArrowDownToLine, Copy, ArrowLeft, ArrowRight, BookCheck, BookOpen, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clock3, ExternalLink, FileCheck2, Flag, GraduationCap, History, LayoutDashboard, ListFilter, LockKeyhole, Menu, Play, RotateCcw, ShieldCheck, Sparkles, Target, Trash2, X, XCircle} from 'lucide-react'
import {abandonState, CHAPTERS, EXAM_DURATION, filterQuestions, finishState, formatTime, getResult, isCorrect, startAttempt, STORAGE_KEY, toggleOption} from './core'
import {StudyProvider, useStudy} from './store'
import {exportStudy, importStudy, MAX_BACKUP_CODE_LENGTH} from './transfer'
import type {Attempt, Bank, Question, StudyState} from './types'

const paperColors: Record<string,string> = {A:'mint',B:'blue',C:'violet',D:'sand'}
const paperDescriptions: Record<string,string> = {A:'从基础概念出发，建立完整知识框架。',B:'巩固测试方法，把理解用在实际场景中。',C:'连接知识与应用，检验你的学习成果。',D:'再来一次完整演练，让准备更充分。'}
const dateText = (date: number) => new Date(date).toLocaleString('zh-CN',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})
function Badge({children, tone='neutral'}:{children:ReactNode;tone?:string}) {return <span className={`badge ${tone}`}>{children}</span>}
function Progress({value}:{value:number}) {return <div className="progress-track"><span style={{width:`${Math.min(100,Math.max(0,value))}%`}} /></div>}
function Empty({icon=<BookOpen/>,title,children}:{icon?:ReactNode;title:string;children:ReactNode}) {return <div className="empty-state"><div className="empty-icon">{icon}</div><h2>{title}</h2><div>{children}</div></div>}

function Shell() {
  const {state,storageError,dismissError} = useStudy()
  const [open,setOpen] = useState(false)
  const location = useLocation()
  useEffect(()=>{setOpen(false);window.scrollTo({top:0})},[location.pathname,location.search])
  const links = [{to:'/',name:'学习概览',icon:<LayoutDashboard/>},{to:'/practice',name:'题库练习',icon:<BookOpen/>},{to:'/exams',name:'模拟考试',icon:<FileCheck2/>},{to:'/mistakes',name:'我的错题',icon:<BookCheck/>},{to:'/history',name:'考试记录',icon:<History/>}]
  const current = links.find(l=>l.to==='/'?location.pathname==='/':location.pathname.startsWith(l.to))?.name || (location.pathname.startsWith('/results')?'考试报告':location.pathname.startsWith('/exam/')?'模拟考试':'关于题库')
  return <div className="app-shell">
    {open && <button className="sidebar-backdrop" aria-label="关闭导航" onClick={()=>setOpen(false)}/>}
    <aside className={`sidebar ${open?'is-open':''}`}>
      <Link className="brand" to="/"><span className="brand-symbol"><BookCheck size={25}/></span><span><strong>ISTQB <span>练习室</span></strong><small>把知识练成把握</small></span></Link>
      <div className="sidebar-caption">学习空间</div>
      <nav aria-label="主导航">{links.map(l=><NavLink end={l.to==='/'} to={l.to} key={l.to} className={({isActive})=>`nav-link ${isActive?'active':''}`}>{l.icon}<span>{l.name}</span>{l.to==='/mistakes'&&state.mistakes.length>0&&<b className="nav-count">{state.mistakes.length}</b>}</NavLink>)}</nav>
      <div className="sidebar-bottom"><div className="syllabus-note"><span className="tiny-square"><GraduationCap size={18}/></span><div><strong>CTFL 基础级</strong><span>大纲 4.0.1 · 中文题库</span></div><span className="status-dot"/></div><Link className="about-link" to="/about"><CircleHelp size={16}/>题库说明与数据备份<ChevronRight size={14}/></Link></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" aria-label="打开导航" onClick={()=>setOpen(true)}><Menu/></button><span className="breadcrumb">学习空间 <ChevronRight size={13}/> <strong>{current}</strong></span></div><div className="local-chip"><LockKeyhole size={13}/><span>记录仅保存在本机</span><span className="status-dot"/></div></header>
      <main className="workspace">{storageError&&<div className="storage-warning" role="alert"><span>{storageError} <Link to="/about">管理学习记录</Link></span><button className="icon-button" onClick={dismissError} aria-label="关闭提示"><X size={16}/></button></div>}
        {state.activeExam && !location.pathname.startsWith('/exam/') && <div className="active-banner"><Clock3 size={17}/><span>你有一场进行中的 {state.activeExam.paper} 卷考试，倒计时仍在继续。</span><Link to={`/exam/${state.activeExam.paper}`}>继续考试 <ArrowRight size={15}/></Link></div>}
        <Routes><Route path="/" element={<Dashboard/>}/><Route path="/practice" element={<Practice/>}/><Route path="/exams" element={<Exams/>}/><Route path="/exam/:paper" element={<Exam/>}/><Route path="/results/:id" element={<Results/>}/><Route path="/mistakes" element={<Mistakes/>}/><Route path="/history" element={<HistoryPage/>}/><Route path="/about" element={<About/>}/><Route path="*" element={<Empty title="这一页还没有内容"><Link className="button primary" to="/">返回学习概览</Link></Empty>}/></Routes>
        <footer className="page-footer"><span>专注每一道题，让进步看得见。</span><span>ISTQB CTFL 4.0.1 <span className="footer-dot">·</span> 非官方学习工具 <span className="footer-dot">·</span> <span className="codex-credit">Made with OpenAI Codex</span></span></footer>
      </main>
    </div>
  </div>
}

function StudyIllustration() {return <svg viewBox="0 0 300 218" fill="none" aria-hidden="true" className="study-illustration">
  <circle cx="166" cy="108" r="95" fill="#E5F1EC"/><circle cx="166" cy="108" r="72" stroke="#CFE4D9" strokeDasharray="3 6"/>
  <rect x="82" y="51" width="132" height="143" rx="12" fill="#C3DCD0" transform="rotate(-10 82 51)"/>
  <rect x="96" y="27" width="132" height="160" rx="12" fill="white" stroke="#CEE0D6"/>
  <rect x="115" y="46" width="51" height="7" rx="3.5" fill="#DCE7E2"/><rect x="115" y="60" width="88" height="5" rx="2.5" fill="#EAF0EC"/>
  {[82,109,136].map((y,i)=><g key={y}><rect x="115" y={y} width="15" height="15" rx="4" fill={i<2?'#E0F0E6':'#F0F3F1'}/>{i<2&&<path d={`m119 ${y+7} 3 3 5-6`} stroke="#38856B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>}<rect x="140" y={y+3} width={i===1?51:64} height="4" rx="2" fill="#C6D7CE"/><rect x="140" y={y+11} width="43" height="3" rx="1.5" fill="#E9EEEB"/></g>)}
  <rect x="195" y="113" width="54" height="54" rx="17" fill="#217A61" transform="rotate(10 195 113)"/><path d="m209 139 8 8 15-19" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
  <path d="m68 84 4 5 7-9M242 66l5 4 5-4M62 155l4-3 3 4" stroke="#A1BFAF" strokeWidth="2" strokeLinecap="round"/>
  <circle cx="244" cy="87" r="3" fill="#A9C5B5"/><circle cx="81" cy="179" r="3" fill="#D7BC87"/>
</svg>}

function Dashboard() {
  const {bank,state} = useStudy()
  const done = Object.keys(state.practice.submitted).filter(id=>state.practice.submitted[id])
  const correct = done.filter(id=>{const q=bank.questions.find(q=>q.id===id);return q && isCorrect(state.practice.answers[id],q.correctAnswers)})
  const percent = Math.round(done.length/bank.questions.length*100)
  const hasProgress = done.length>0 || state.practice.index>0
  return <>
    <div className="page-heading"><div><div className="eyebrow">YOUR LEARNING, ONE STEP AT A TIME</div><h1>学习概览<span className="heading-dot">.</span></h1><p>准备好了吗？从一道题开始，离目标更近一步。</p></div><Badge tone="green"><span className="status-dot"/> CTFL 4.0.1</Badge></div>
    <section className="welcome-panel"><div className="welcome-copy"><div className="welcome-label"><Sparkles size={14}/> 给认真准备的你</div><h2>每一次练习，<br/>都多一分把握。</h2><p>四套完整模拟卷，配合逐题解析。<br className="desktop-break"/>理解知识、查漏补缺，按自己的节奏稳步前进。</p><Link className="button primary" to={hasProgress?`/practice?filter=${encodeURIComponent(state.practice.filter)}&resume=1`:'/practice'}><Play size={15} fill="currentColor"/>{hasProgress?'继续上次练习':'开始我的第一次练习'}<ArrowRight size={16}/></Link></div><div className="welcome-art"><StudyIllustration/><span className="art-caption"><ShieldCheck size={14}/> 官方资料 · 原题解析</span></div><div className="welcome-progress"><div className="mini-label">我的学习进度</div><div className="progress-ring" style={{'--progress':`${percent*3.6}deg`} as React.CSSProperties}><div><strong>{percent}<small>%</small></strong><span>题库已练习</span></div></div><p>已练习 <strong>{done.length}</strong> / {bank.questions.length} 题</p><div className="progress-footnote">日积月累，自有收获</div></div></section>
    <div className="stats-grid"><Stat icon={<BookOpen/>} label="题库总量" value="186" unit="道" note="160 道模拟题 + 26 道附加题"/><Stat icon={<Target/>} label="练习正确率" value={done.length?`${Math.round(correct.length/done.length*100)}`:'—'} unit={done.length?'%':''} note={done.length?`${correct.length} 道答对，继续保持`:'开始练习后在这里查看'}/><Stat icon={<BookCheck/>} label="待复习错题" value={String(state.mistakes.length)} unit="道" note={state.mistakes.length?'把薄弱点练成得分点':'每一次订正，都是一次进步'}/><Stat icon={<FileCheck2/>} label="完成模拟考试" value={String(state.history.length)} unit="次" note={state.history.length?`已通过 ${state.history.filter(a=>getResult(a,bank.questions).passed).length} 次`:'用一场考试检验学习成果'}/></div>
    <div className="section-heading"><div><h2>来一场完整演练 <Badge>4 套试卷</Badge></h2><p>保持原卷顺序，还原考试节奏。</p></div><Link className="text-link" to="/exams">查看全部 <ArrowRight size={15}/></Link></div>
    <div className="paper-grid">{'ABCD'.split('').map(p=><PaperCard key={p} paper={p}/>)}</div>
    <div className="section-heading"><div><h2>按章节，逐个攻克</h2><p>跟随大纲的六个章节，给知识建立清晰的坐标。</p></div><Link className="text-link" to="/practice">进入题库 <ArrowRight size={15}/></Link></div>
    <div className="chapter-grid">{CHAPTERS.map((name,i)=>{const total=bank.questions.filter(q=>q.chapter===i+1).length;const count=done.filter(id=>bank.questions.find(q=>q.id===id)?.chapter===i+1).length;return <Link key={name} to={`/practice?filter=chapter:${i+1}`} className="chapter-card"><span className="chapter-number">0{i+1}</span><div><strong>{name}</strong><span>{total} 道题 <b>·</b> 已练习 {count} 道</span><Progress value={count/total*100}/></div><ChevronRight size={17}/></Link>})}</div>
    <div className="extra-strip"><div className="extra-icon"><GraduationCap/></div><div><h3>还想练得更扎实？</h3><p>A 卷另有 26 道附加题，帮助你加深对知识点的理解。</p></div><Link className="button secondary" to="/practice?filter=extra">开始附加练习 <ArrowRight size={15}/></Link></div>
  </>
}
function Stat({icon,label,value,unit,note}:{icon:ReactNode;label:string;value:string;unit:string;note:string}) {return <div className="stat-card"><div className="stat-label"><span>{label}</span>{icon}</div><div className="stat-value">{value}<small>{unit}</small></div><p>{note}</p></div>}
function PaperCard({paper}:{paper:string}) {
  const {state} = useStudy()
  const count=state.history.filter(a=>a.paper===paper).length
  return <article className={`paper-card ${paperColors[paper]}`}><div className="paper-card-top"><span className="paper-letter">{paper}</span><Badge>模拟试卷</Badge></div><h3>基础级模拟卷 {paper}</h3><p>{paperDescriptions[paper]}</p><div className="paper-meta"><span><BookOpen size={13}/>40 道题</span><span><Clock3 size={13}/>60 分钟</span></div><div className="paper-card-actions"><Link className="button paper-start" to={`/exam/${paper}`}>开始模拟 <ArrowRight size={14}/></Link><Link className="paper-practice" to={`/practice?filter=paper:${paper}`}>逐题练习</Link></div><div className="paper-card-foot"><span className={count?'completed-dot':'unstarted-dot'}/>{count?`已完成 ${count} 次`:'尚未开始'}<span>26 分及格</span></div></article>
}

function FilterSelect({value,onChange}:{value:string;onChange:(v:string)=>void}) {return <div className="filter-select"><ListFilter size={16}/><select aria-label="练习范围" value={value} onChange={e=>onChange(e.target.value)}><optgroup label="按试卷练习">{'ABCD'.split('').map(p=><option key={p} value={`paper:${p}`}>模拟卷 {p} · 40 题</option>)}<option value="extra">A 卷附加题 · 26 题</option></optgroup><optgroup label="按章节练习">{CHAPTERS.map((c,i)=><option key={c} value={`chapter:${i+1}`}>第 {i+1} 章 · {c}</option>)}</optgroup><option value="mistakes">我的错题</option></select><ChevronDown size={14}/></div>}
function filterName(filter:string) {const [kind,value]=filter.split(':');return kind==='chapter'?`第 ${value} 章 · ${CHAPTERS[Number(value)-1]}`:kind==='extra'?'A 卷附加题':kind==='mistakes'?'错题复习':`模拟卷 ${value}`}

function Practice() {
  const {bank,state,setState} = useStudy()
  const [params,setParams] = useSearchParams()
  const requested=params.get('filter')||state.practice.filter
  const valid=/^(paper:[A-D]|chapter:[1-6]|extra|mistakes)$/.test(requested)?requested:'paper:A'
  useEffect(()=>{if(state.practice.filter!==valid)setState(s=>({...s,practice:{...s.practice,filter:valid,index:0}}))},[valid,state.practice.filter,setState])
  const items=filterQuestions(bank.questions,valid,state.mistakes)
  const requestedQuestion=params.get('question')
  useEffect(()=>{
    if(!requestedQuestion)return
    const target=filterQuestions(bank.questions,valid,state.mistakes).findIndex(q=>q.id===requestedQuestion)
    if(target>=0)setState(s=>({...s,practice:{...s.practice,index:target}}))
    setParams({filter:valid},{replace:true})
  },[requestedQuestion,valid,bank,state.mistakes,setParams,setState])
  const index=Math.min(state.practice.filter===valid?state.practice.index:0,Math.max(0,items.length-1))
  const q=items[index]
  const submitted=!!state.practice.submitted[q?.id]
  const selected=state.practice.answers[q?.id]||[]
  const go=(i:number)=>{setState(s=>({...s,practice:{...s.practice,index:i}}));window.scrollTo({top:0,behavior:'smooth'})}
  function choose(id:string) {setState(s=>({...s,practice:{...s.practice,answers:{...s.practice.answers,[q.id]:toggleOption(s.practice.answers[q.id]||[],id,q.selectionCount)}}}))}
  function submit() {setState(s=>({...s,practice:{...s.practice,submitted:{...s.practice.submitted,[q.id]:true}},mistakes:isCorrect(selected,q.correctAnswers)?s.mistakes:[...new Set([...s.mistakes,q.id])]}))}
  return <><div className="page-heading"><div><div className="eyebrow">PRACTICE MAKES PROGRESS</div><h1>题库练习<span className="heading-dot">.</span></h1><p>不急着做下一题，先把这一题真正理解。</p></div><FilterSelect value={valid} onChange={filter=>setParams({filter})}/></div>
    {!q?<Empty title="这里暂时没有错题" icon={<CheckCircle2/>}><p>继续练习，答错的题目会自动收集在这里。</p><Link className="button primary" to="/practice?filter=paper:A">开始练习 <ArrowRight size={15}/></Link></Empty>:<div className="question-layout"><div className="question-main"><div className="session-bar"><span>{filterName(valid)}</span><span><strong>{index+1}</strong> / {items.length} 题</span></div><Progress value={(index+1)/items.length*100}/><QuestionCard q={q} selected={selected} onChoose={choose} reveal={submitted}/>
      <div className="question-actions"><button className="button secondary" disabled={index===0} onClick={()=>go(index-1)}><ChevronLeft size={16}/>上一题</button><div>{submitted?<button className="button secondary" onClick={()=>setState(s=>({...s,practice:{...s.practice,answers:{...s.practice.answers,[q.id]:[]},submitted:{...s.practice.submitted,[q.id]:false}}}))}><RotateCcw size={15}/>再做一次</button>:<button className="button primary" disabled={selected.length!==q.selectionCount} onClick={submit}>提交答案 <Check size={16}/></button>}<button className="button primary" disabled={index===items.length-1} onClick={()=>go(index+1)}>下一题 <ChevronRight size={16}/></button></div></div>
      {submitted&&<Explanation q={q} selected={selected}/>}
    </div><aside className="question-aside"><div className="panel navigator"><div className="panel-title">练习导航 <span>{items.length} 题</span></div><div className="number-grid">{items.map((item,i)=><button key={item.id} aria-label={`跳转第 ${i+1} 题`} aria-current={i===index?'step':undefined} className={`${i===index?'current ':''}${state.practice.submitted[item.id]?(isCorrect(state.practice.answers[item.id],item.correctAnswers)?'correct':'incorrect'):state.practice.answers[item.id]?.length?'answered':''}`} onClick={()=>go(i)}>{i+1}</button>)}</div><div className="navigator-legend"><span><i className="legend-correct"/>答对</span><span><i className="legend-wrong"/>答错</span><span><i/>未提交</span></div></div><div className="aside-tip"><ShieldCheck size={18}/><strong>安心练习，自动保存</strong><p>进度保存在当前浏览器中。随时离开，下次接着练。</p></div></aside></div>}
  </>
}

function trapDialogFocus(event: React.KeyboardEvent<HTMLElement>) {
  if(event.key!=='Tab')return
  const elements=event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex="0"]')
  const first=elements[0], last=elements[elements.length-1]
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
}
function SourceImages({images,label}:{images:string[];label:string}) {const [zoom,setZoom]=useState<string|null>(null);useEffect(()=>{if(!zoom)return;const handler=(e:KeyboardEvent)=>{if(e.key==='Escape')setZoom(null)};window.addEventListener('keydown',handler);const previous=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{window.removeEventListener('keydown',handler);document.body.style.overflow=previous}},[zoom]);return <><div className="source-images">{images.map((image,i)=><button key={image} className="source-image-button" onClick={()=>setZoom(image)} aria-label={`放大${label}，第 ${i+1} 部分`}><img src={image} alt={`${label}（第 ${i+1} 部分），点击放大`} loading="lazy"/><span><ExternalLink size={12}/>点击放大</span></button>)}</div>{zoom&&<div className="image-modal" onKeyDown={trapDialogFocus} role="dialog" aria-modal="true" aria-label={`放大${label}`} onClick={()=>setZoom(null)}><button className="icon-button modal-close" autoFocus aria-label="关闭图片" onClick={()=>setZoom(null)}><X/></button><div className="image-modal-scroll" tabIndex={0} aria-label="放大图片，可横向滚动查看" onClick={e=>e.stopPropagation()}><img src={zoom} alt={label}/></div></div>}</>}
function QuestionCard({q,selected,onChoose,reveal=false}:{q:Question;selected:string[];onChoose?:(id:string)=>void;reveal?:boolean}) {
  return <article className="question-card panel"><div className="question-card-meta"><div><Badge tone="green">{q.selectionCount>1?`多选题 · 选 ${q.selectionCount} 项`:'单选题'}</Badge><Badge>{q.level}</Badge><span>{q.supplementary?`A 卷附加题 ${q.number}`:`${q.paper} 卷 · 第 ${q.number} 题`}</span></div><small>1 分</small></div>
    {q.stemImages.length?<div className="question-stem-image"><SourceImages images={q.stemImages} label="题干原图"/><p className="sr-only">{q.stem}</p></div>:<div className="question-stem">{q.stem}</div>}
    <div className="options" role="group" aria-label={q.selectionCount>1?`选择 ${q.selectionCount} 个答案`:'选择一个答案'}>{q.options.map(o=>{const chosen=selected.includes(o.id);const correct=reveal&&q.correctAnswers.includes(o.id);const wrong=reveal&&chosen&&!correct;return <button type="button" key={o.id} disabled={reveal||!onChoose} aria-pressed={chosen} className={`option ${chosen?'selected ':''}${correct?'right ':''}${wrong?'wrong ':''}`} onClick={()=>onChoose?.(o.id)}><span className="option-letter">{o.id}</span><span className="option-text">{o.text}</span><span className="option-state">{correct?<CheckCircle2 size={19}/>:wrong?<XCircle size={19}/>:chosen?<Check size={18}/>:null}</span></button>})}</div>
    <div className="question-bottom"><span>{q.learningObjective} <b>·</b> 第 {q.chapter} 章</span><details className="source-details"><summary>查看原题 <ExternalLink size={12}/></summary><div className="source-detail-content"><p>问题 PDF 第 {q.sourcePages.join('、')} 页 · 保留原文排版</p><SourceImages images={q.sourceImages} label="完整原题"/></div></details></div>
  </article>
}
function Explanation({q,selected}:{q:Question;selected:string[]}) {
  const correct=isCorrect(selected,q.correctAnswers)
  return <section className="panel explanation" aria-label="答案解析"><div className={`answer-verdict ${correct?'is-correct':'is-incorrect'}`}>{correct?<CheckCircle2/>:<XCircle/>}<div><strong>{correct?'回答正确，继续保持！':selected.length?'这道题值得再看一遍':'这道题尚未作答'}</strong><span>正确答案：{q.correctAnswers.join('、')}<b>你的答案：{selected.join('、')||'未作答'}</b></span></div></div><div className="explanation-body"><h3><BookOpen size={17}/>答案解析</h3><div className="explanation-text">{q.explanation}</div><div className="learning-objective"><Target size={16}/><span>学习目标 <strong>{q.learningObjective}</strong> · {q.level}</span></div><details className="answer-source"><summary>对照原版解析 · PDF 第 {q.answerPages.join('、')} 页 <ChevronDown size={14}/></summary><SourceImages images={q.answerImages} label="原版答案解析"/></details></div></section>
}

function Exams() {return <><div className="page-heading"><div><div className="eyebrow">PUT YOUR KNOWLEDGE TO THE TEST</div><h1>模拟考试<span className="heading-dot">.</span></h1><p>给自己 60 分钟，检验一次完整的学习成果。</p></div><Badge tone="green"><ShieldCheck size={13}/>原卷顺序</Badge></div><div className="exam-rules-strip"><span><BookOpen/>每卷 40 题</span><span><Clock3/>限时 60 分钟</span><span><Target/>26 分及格</span><span><FileCheck2/>交卷后查看解析</span></div><div className="paper-grid">{'ABCD'.split('').map(p=><PaperCard key={p} paper={p}/>)}</div><div className="panel instructions"><h2>给这次模拟，一个认真的开始。</h2><p>选择一份试卷，按自己的判断完成作答。多选题需要选对全部指定选项才得分，漏选、错选及未答题均不得分。</p><p>作答自动保存，离开页面后仍会继续计时。时间到时自动交卷；如果关闭了页面，重新打开时会完成结算。也可以在考试中选择“放弃考试”，舍弃本场记录。</p><Link className="text-link" to="/practice?filter=extra">想先热身？试试 26 道附加练习 <ArrowRight size={15}/></Link></div></>}

function ConfirmDialog({title,children,onCancel,onConfirm,confirmText='确认'}:{title:string;children:ReactNode;onCancel:()=>void;onConfirm:()=>void;confirmText?:string}) {
  useEffect(()=>{const h=(e:KeyboardEvent)=>{if(e.key==='Escape')onCancel()};window.addEventListener('keydown',h);return()=>window.removeEventListener('keydown',h)},[onCancel])
  return <div className="dialog-backdrop" onClick={onCancel}><div className="confirm-dialog panel" onKeyDown={trapDialogFocus} role="dialog" aria-modal="true" aria-labelledby="dialog-title" onClick={e=>e.stopPropagation()}><h2 id="dialog-title">{title}</h2><div>{children}</div><div className="dialog-actions"><button className="button secondary" autoFocus onClick={onCancel}>返回</button><button className="button primary" onClick={onConfirm}>{confirmText}</button></div></div></div>
}
function Exam() {
  const {paper=''}=useParams()
  const {bank,state,setState}=useStudy()
  const navigate=useNavigate()
  const [confirm,setConfirm]=useState(false)
  const [abandon,setAbandon]=useState(false)
  const [now,setNow]=useState(Date.now())
  const [currentId,setCurrentId]=useState(state.activeExam?.paper===paper?state.activeExam.id:'')
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[])
  useEffect(()=>{if(currentId&&!state.activeExam){const done=state.history.find(a=>a.id===currentId);if(done)navigate(`/results/${done.id}`,{replace:true})}},[currentId,state.activeExam,state.history,navigate])
  if(!/^[A-D]$/.test(paper))return <Empty title="没有找到这套试卷"><Link to="/exams" className="button primary">选择试卷</Link></Empty>
  const active=state.activeExam
  function start() {const attempt=startAttempt(paper,bank.questions);setCurrentId(attempt.id);setState(s=>({...s,activeExam:attempt}))}
  if(!active||active.paper!==paper)return <><Link className="back-link" to="/exams"><ArrowLeft size={16}/>返回模拟考试</Link><div className="exam-start panel"><span className={`paper-letter large ${paperColors[paper]}`}>{paper}</span><div className="eyebrow">CERTIFIED TESTER FOUNDATION LEVEL</div><h1>基础级模拟卷 {paper}</h1><p>一次完整演练，让准备更有方向。</p><div className="exam-start-facts"><div><strong>40<span>题</span></strong><small>每题 1 分</small></div><div><strong>60<span>分钟</span></strong><small>限时完成</small></div><div><strong>26<span>分</span></strong><small>及格线 · 65%</small></div></div><div className="start-notes"><p><CheckCircle2 size={16}/>交卷前不显示答案，完成后提供逐题解析。</p><p><CheckCircle2 size={16}/>支持答题卡跳转和标记，进度自动保存在本机。</p><p><Clock3 size={16}/>开始后计时不暂停，关闭页面后仍会继续计时。</p></div>{active?<div className="existing-exam-note"><p>你还有一场 {active.paper} 卷考试正在进行。请先完成或放弃当前考试。</p><Link className="button primary" to={`/exam/${active.paper}`}>继续 {active.paper} 卷 <ArrowRight size={16}/></Link></div>:<button className="button primary wide" onClick={start}><Play size={16}/>准备好了，开始考试</button>}</div></>
  const attempt=active
  const index=attempt.index
  const q=bank.questions.find(q=>q.id===attempt.questionIds[index])!
  const answered=attempt.questionIds.filter(id=>attempt.answers[id]?.length).length
  const left=Math.max(0,attempt.deadline-now)
  function choose(option:string) {setState(s=>{if(!s.activeExam||Date.now()>=s.activeExam.deadline)return s;return {...s,activeExam:{...s.activeExam,answers:{...s.activeExam.answers,[q.id]:toggleOption(s.activeExam.answers[q.id]||[],option,q.selectionCount)}}}})}
  function go(i:number) {setState(s=>s.activeExam?{...s,activeExam:{...s.activeExam,index:i}}:s);window.scrollTo({top:0,behavior:'smooth'})}
  function discard() {setCurrentId('');setState(s=>abandonState(s));navigate('/exams',{replace:true})}
  function submit() {const id=attempt.id;setState(s=>finishState(s,bank.questions));navigate(`/results/${id}`)}
  return <><div className="exam-header"><div><Badge tone="green">模拟考试进行中</Badge><h1>基础级模拟卷 {paper}</h1></div><div className={`exam-timer ${left<5*60*1000?'urgent':''}`}><Clock3 size={20}/><div><small>剩余时间</small><strong>{formatTime(left)}</strong></div></div><div className="exam-header-actions"><button className="button secondary abandon-button" onClick={()=>setAbandon(true)}>放弃考试</button><button className="button primary" onClick={()=>setConfirm(true)}>交卷 <FileCheck2 size={16}/></button></div></div><div className="question-layout"><div className="question-main"><div className="session-bar"><span>已作答 {answered} / 40 题</span><span>当前第 <strong>{index+1}</strong> 题</span></div><Progress value={answered/40*100}/><QuestionCard q={q} selected={attempt.answers[q.id]||[]} onChoose={choose}/><div className="question-actions"><button className="button secondary" disabled={index===0} onClick={()=>go(index-1)}><ChevronLeft size={16}/>上一题</button><button className={`button flag-button ${attempt.flags.includes(q.id)?'flagged':''}`} aria-pressed={attempt.flags.includes(q.id)} onClick={()=>setState(s=>s.activeExam?{...s,activeExam:{...s.activeExam,flags:s.activeExam.flags.includes(q.id)?s.activeExam.flags.filter(id=>id!==q.id):[...s.activeExam.flags,q.id]}}:s)}><Flag size={15}/>{attempt.flags.includes(q.id)?'已标记':'标记待检查'}</button>{index===39?<button className="button primary" onClick={()=>setConfirm(true)}>检查并交卷 <Check size={16}/></button>:<button className="button primary" onClick={()=>go(index+1)}>下一题 <ChevronRight size={16}/></button>}</div></div><aside className="question-aside"><div className="panel navigator"><div className="panel-title">答题卡 <span>{answered} / 40</span></div><div className="number-grid">{attempt.questionIds.map((id,i)=><button key={id} aria-label={`跳转第 ${i+1} 题${attempt.flags.includes(id)?'，已标记':''}`} aria-current={i===index?'step':undefined} className={`${i===index?'current ':''}${attempt.answers[id]?.length?'answered ':''}${attempt.flags.includes(id)?'flagged':''}`} onClick={()=>go(i)}>{i+1}{attempt.flags.includes(id)&&<span className="flag-dot"/>}</button>)}</div><div className="navigator-legend"><span><i className="legend-correct"/>已答</span><span><i className="legend-flag"/>标记</span><span><i/>未答</span></div></div><div className="aside-tip"><Clock3 size={18}/><strong>留一点时间给检查</strong><p>已标记 {attempt.flags.length} 道题。交卷前，别忘了再确认一次。</p></div></aside></div>{confirm&&<ConfirmDialog title="准备好提交试卷了吗？" confirmText="确认交卷" onCancel={()=>setConfirm(false)} onConfirm={submit}><p>已作答 {answered} / 40 题{40-answered>0?`，还有 ${40-answered} 道题未作答`:''}。</p>{attempt.flags.length>0&&<p>你标记了 {attempt.flags.length} 道题待检查。</p>}<p>交卷后不能修改答案，可以查看成绩与全部解析。</p></ConfirmDialog>}{abandon&&<ConfirmDialog title="放弃这场考试？" confirmText="放弃并舍弃记录" onCancel={()=>setAbandon(false)} onConfirm={discard}><p>本场考试的作答、标记和进度将被丢弃，不生成成绩，也不加入错题本。</p><p>已有的练习进度、考试记录和错题会保留。放弃后可以重新开始考试。</p></ConfirmDialog>}</>
}

function Results() {
  const {id}=useParams()
  const {bank,state}=useStudy()
  const attempt=state.history.find(a=>a.id===id)
  const [filter,setFilter]=useState('all')
  const [index,setIndex]=useState(0)
  if(!attempt)return <Empty title="这份考试记录不在当前浏览器中"><p>考试记录仅保存在完成考试的浏览器里。</p><Link to="/history" className="button primary">查看本机记录</Link></Empty>
  const result=getResult(attempt,bank.questions)
  const items=attempt.questionIds.map(id=>bank.questions.find(q=>q.id===id)!).filter(q=>filter==='all'||!isCorrect(attempt.answers[q.id],q.correctAnswers))
  const q=items[Math.min(index,items.length-1)]
  const elapsed=(attempt.endedAt||attempt.deadline)-attempt.startedAt
  return <><Link className="back-link" to="/history"><ArrowLeft size={16}/>返回考试记录</Link><div className="page-heading"><div><div className="eyebrow">EVERY RESULT IS A NEW START</div><h1>模拟卷 {attempt.paper} · 考试报告</h1><p>{dateText(attempt.startedAt)} · 用时 {formatTime(elapsed)}</p></div><Link className="button secondary" to={`/exam/${attempt.paper}`}><RotateCcw size={15}/>再考一次</Link></div><div className={`result-summary panel ${result.passed?'passed':'not-passed'}`}><div className="result-score"><strong>{result.score}</strong><span>/ 40 分</span></div><div><Badge tone={result.passed?'green':'orange'}>{result.passed?'通过模拟考试':'继续加油'}</Badge><h2>{result.passed?'准备的每一步，都有回报。':'找到薄弱处，就是进步的开始。'}</h2><p>答对 {result.correct} 题 · 答错 {result.total-result.correct-result.unanswered} 题 · 未答 {result.unanswered} 题 <span>及格线 26 分</span></p></div><div className="result-seal">{result.passed?<ShieldCheck/>:<Target/>}</div></div><section className="panel chapter-results"><h3>各章节表现</h3><div className="chapter-results-grid">{result.chapters.map((c,i)=><div key={c.name}><span><b>0{i+1}</b>{c.name}<strong>{c.correct} / {c.total}</strong></span><Progress value={c.total?c.correct/c.total*100:0}/></div>)}</div></section><div className="section-heading"><div><h2>回到每一道题</h2><p>错题已加入错题本，复习后可手动移除。</p></div><div className="segmented-control"><button className={filter==='all'?'active':''} onClick={()=>{setFilter('all');setIndex(0)}}>全部 40 题</button><button className={filter==='wrong'?'active':''} onClick={()=>{setFilter('wrong');setIndex(0)}}>错题与未答 {40-result.correct}</button></div></div>{q?<><div className="review-pagination"><span>{index+1} / {items.length}</span><button className="button secondary small" disabled={index===0} onClick={()=>setIndex(i=>i-1)}><ChevronLeft size={15}/>上一题</button><button className="button secondary small" disabled={index===items.length-1} onClick={()=>setIndex(i=>i+1)}>下一题<ChevronRight size={15}/></button></div><QuestionCard q={q} selected={attempt.answers[q.id]||[]} reveal/><Explanation q={q} selected={attempt.answers[q.id]||[]}/></>:<Empty title="全部答对，做得很好！"><p>可以切换到全部题目，回顾这一场的收获。</p></Empty>}</>
}

function Mistakes() {
  const {bank,state,setState}=useStudy()
  const [chapter,setChapter]=useState('all')
  const questions=bank.questions.filter(q=>state.mistakes.includes(q.id)&&(chapter==='all'||q.chapter===Number(chapter)))
  return <><div className="page-heading"><div><div className="eyebrow">TURN MISTAKES INTO MOMENTUM</div><h1>我的错题<span className="heading-dot">.</span></h1><p>错题不代表退步，重新理解它，就是一次进步。</p></div>{state.mistakes.length>0&&<Link className="button primary" to="/practice?filter=mistakes"><RotateCcw size={15}/>开始错题复习</Link>}</div><div className="list-toolbar"><span>共 <strong>{state.mistakes.length}</strong> 道待复习题目</span><select aria-label="筛选错题章节" value={chapter} onChange={e=>setChapter(e.target.value)}><option value="all">全部章节</option>{CHAPTERS.map((c,i)=><option key={c} value={i+1}>第 {i+1} 章 · {c}</option>)}</select></div>{questions.length?<div className="mistake-list">{questions.map(q=><article className="mistake-row panel" key={q.id}><span className={`paper-letter small ${paperColors[q.paper]}`}>{q.paper}</span><div className="mistake-copy"><div><Badge>{q.selectionCount>1?'多选题':'单选题'}</Badge><span>第 {q.number} 题 · 第 {q.chapter} 章 · {q.learningObjective}</span></div><h3>{q.stem.slice(0,150)}</h3></div><Link className="text-link" to={`/practice?filter=mistakes&question=${q.id}`}>复习 <ArrowRight size={15}/></Link><button className="icon-button remove-mistake" aria-label={`移除 ${q.paper} 卷第 ${q.number} 题`} onClick={()=>setState(s=>({...s,mistakes:s.mistakes.filter(id=>id!==q.id)}))}><Trash2 size={16}/></button></article>)}</div>:<Empty title={state.mistakes.length?'这个章节暂时没有错题':'你的错题本还是空的'} icon={<BookCheck/>}><p>{state.mistakes.length?'试试其他章节，或继续进行专项练习。':'练习或考试中的错题会自动出现在这里。'}</p><Link className="button primary" to="/practice">去练习 <ArrowRight size={15}/></Link></Empty>}</>
}
function HistoryPage() {
  const {bank,state}=useStudy()
  return <><div className="page-heading"><div><div className="eyebrow">LOOK BACK, MOVE FORWARD</div><h1>考试记录<span className="heading-dot">.</span></h1><p>记录每一次尝试，也看见每一点进步。</p></div><Link to="/exams" className="button primary">开始新考试 <ArrowRight size={15}/></Link></div>{state.history.length?<div className="panel history-table"><div className="history-table-head"><span>模拟试卷</span><span>开始时间</span><span>考试用时</span><span>成绩</span><span>结果</span><span/></div>{state.history.map(a=>{const r=getResult(a,bank.questions);return <div className="history-row" key={a.id}><span className="history-paper"><span className={`paper-letter small ${paperColors[a.paper]}`}>{a.paper}</span><strong>模拟卷 {a.paper}</strong></span><span>{dateText(a.startedAt)}</span><span>{formatTime((a.endedAt||a.deadline)-a.startedAt)}</span><span><strong>{r.score}</strong><small> / 40</small></span><span><Badge tone={r.passed?'green':'orange'}>{r.passed?'已通过':'未通过'}</Badge></span><Link className="text-link" to={`/results/${a.id}`}>查看报告 <ChevronRight size={14}/></Link></div>})}</div>:<Empty title="你的第一份成绩单，等你开启" icon={<History/>}><p>完成一次模拟考试后，就能在这里回顾成绩与解析。</p><Link className="button primary" to="/exams">选择一份试卷 <ArrowRight size={15}/></Link></Empty>}</>
}

function DataTransfer() {
  const {state,replaceState}=useStudy()
  const [exportCode,setExportCode]=useState('')
  const [importCode,setImportCode]=useState('')
  const [preview,setPreview]=useState<StudyState|null>(null)
  const [notice,setNotice]=useState('')
  const [error,setError]=useState('')
  const [copying,setCopying]=useState(false)
  const fail=(e:unknown)=>setError(e instanceof Error?e.message:'操作失败，请重试。')
  function generate() {
    setError('');setNotice('');setExportCode('')
    try {setExportCode(exportStudy(state));setNotice('备份码已生成。复制后可在其他浏览器或设备中导入。')}
    catch(e) {fail(e)}
  }
  async function copy() {
    setCopying(true);setError('');setNotice('')
    try {await navigator.clipboard.writeText(exportCode);setNotice('已复制备份码。请妥善保存，备份码可还原你的学习记录。')}
    catch {document.querySelector<HTMLTextAreaElement>('#study-export')?.select();setNotice('浏览器未允许自动复制，已选中备份码，请长按复制或按 Ctrl/Cmd+C。')}
    finally {setCopying(false)}
  }
  function inspect() {
    setError('');setNotice('');setPreview(null)
    try {setPreview(importStudy(importCode))} catch(e) {fail(e)}
  }
  function restore() {
    if(!preview)return
    try {replaceState(preview);setPreview(null);setImportCode('');setExportCode('');setNotice('学习记录已导入并保存。已过期的考试按原截止时间自动结算。');setError('')}
    catch(e) {setPreview(null);fail(e)}
  }
  return <div className="data-transfer">
    <h3>备份与迁移</h3>
    <p>使用 LZ4 压缩备份码，在设备间复制、粘贴即可迁移。包含练习进度、错题、考试历史及进行中的考试，无需上传文件。</p>
    <div className="transfer-actions"><button className="button secondary" onClick={generate}><ArrowDownToLine size={15}/>{exportCode?'重新生成备份码':'生成导出备份码'}</button>{exportCode&&<button className="button secondary" disabled={copying} onClick={copy}><Copy size={15}/>{copying?'正在复制…':'复制备份码'}</button>}</div>
    {exportCode&&<><label htmlFor="study-export">导出备份码</label><textarea id="study-export" readOnly value={exportCode} onFocus={e=>e.currentTarget.select()} spellCheck={false}/><p className="transfer-hint">这是生成时的记录快照。继续学习后，请重新生成备份。</p></>}
    <label htmlFor="study-import">粘贴备份码以导入</label>
    <textarea id="study-import" placeholder="ISTQB-LZ4-v1:…" value={importCode} maxLength={MAX_BACKUP_CODE_LENGTH} onChange={e=>{setImportCode(e.target.value);setPreview(null);setError('');setNotice('')}} spellCheck={false}/>
    <button className="button secondary" disabled={!importCode.trim()} onClick={inspect}>检查并导入</button>
    <p className="transfer-hint">导入会替换当前浏览器的全部学习记录，建议先导出备份。进行中的考试沿用原截止时间，过期则自动交卷。</p>
    {notice&&<p className="transfer-notice" role="status">{notice}</p>}
    {error&&<p className="transfer-error" role="alert">{error} 当前学习记录未被替换。</p>}
    {preview&&<ConfirmDialog title="用备份替换本机学习记录？" confirmText="确认替换并导入" onCancel={()=>setPreview(null)} onConfirm={restore}>
      <p>备份包含 {Object.values(preview.practice.submitted).filter(Boolean).length} 道已提交练习、{preview.mistakes.length} 道错题、{preview.history.length} 次已完成考试。</p>
      <p>{preview.activeExam?`还有一场 ${preview.activeExam.paper} 卷考试，截止于 ${new Date(preview.activeExam.deadline).toLocaleString('zh-CN')}。${preview.activeExam.deadline<=Date.now()?'该考试已过期，导入后会自动结算。':''}`:'没有进行中的考试。'}</p>
      <p>将覆盖当前练习进度、错题和考试记录。确认前可以返回并先导出当前记录。</p>
    </ConfirmDialog>}
  </div>
}

function About() {
  const {bank,storageError}=useStudy()
  const [reset,setReset]=useState(false)
  function backup() {const blob=new Blob([localStorage.getItem(STORAGE_KEY)||'{}'],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`istqb-study-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(url)}
  return <><div className="page-heading"><div><div className="eyebrow">A LITTLE CONTEXT</div><h1>关于这间练习室<span className="heading-dot">.</span></h1><p>让资料更好用，让练习更专注。</p></div></div><div className="about-grid"><section className="panel about-panel"><h2>题库来源</h2><p>题目来自你提供的 CTFL 基础级 4.0.1 中文模拟卷。四套试卷各 40 题，A 卷另有 26 道附加题，共 186 道。A–D 是不同试卷，不代表难度等级。</p><p>题目与解析版权归 ISTQB®／CSTQB® 及相应作者所有，中文翻译、编辑及出版由 CSTQB 负责。本站为非官方、非商业学习工具，不提供认证或正式考试服务。</p><p>题目及解析保留原文。图表使用源文件裁图，可通过“查看原题”“对照原版解析”核对排版与出处。</p><p>按试卷下载完整试题与答案解析，共 8 份原始 PDF。</p><div className="source-file-list">{bank.sources.map(s=><div key={s.paper}><Badge tone="green">{s.paper} 卷</Badge><div className="source-downloads">{[{label:"试题 PDF",file:s.questionFile},{label:"答案解析 PDF",file:s.answerFile}].map(file=><a key={file.file} className="source-download" href={`/sources/${encodeURIComponent(file.file)}`} download={file.file} aria-label={`下载 ${s.paper} 卷${file.label}`} title={file.file}><ArrowDownToLine size={16}/><span><strong>{file.label}</strong><small>{file.file}</small></span></a>)}</div></div>)}</div></section><section className="panel about-panel"><h2>考试与记录</h2><p>模拟考试默认 40 题、60 分钟、满分 40 分，26 分及格。附加题不计入整卷考试。多选题必须全部选对，漏选、错选及未答均为 0 分。</p><a className="text-link" href="https://istqb.org/wp-content/uploads/2026/05/ISTQB_Exam-Structure-Tables_v1.18.pdf" target="_blank" rel="noreferrer">ISTQB 官方考试结构表 <ExternalLink size={14}/></a><hr/><h2>你的数据，留在你的浏览器</h2><p>无需登录。学习记录保存在本机，其他用户无法通过网站查看。更换浏览器、清除网站数据或使用隐私模式，可能无法保留之前的记录。</p><p>错题答对后仍会保留，确认掌握后可在错题本手动移除。</p><DataTransfer/>{storageError&&<button className="button secondary" onClick={backup}><ArrowDownToLine size={15}/>下载原始记录以备恢复</button>}<button className="danger-link" onClick={()=>setReset(true)}><Trash2 size={14}/>清空本机学习记录</button></section></div>{reset&&<ConfirmDialog title="清空当前浏览器的学习记录？" confirmText="清空记录" onCancel={()=>setReset(false)} onConfirm={()=>{localStorage.removeItem(STORAGE_KEY);window.location.assign('/')}}><p>将删除练习进度、错题、考试记录及进行中的考试。建议先导出备份，此操作无法撤销。</p></ConfirmDialog>}</>
}

export default function App() {
  const [bank,setBank]=useState<Bank|null>(null)
  const [error,setError]=useState('')
  useEffect(()=>{const controller=new AbortController();fetch('/data/questions.json',{signal:controller.signal}).then(r=>{if(!r.ok)throw new Error('题库加载失败');return r.json()}).then((data:Bank)=>{if(data.version!==1||data.questions?.length!==186)throw new Error('题库版本或内容不完整');setBank(data)}).catch(e=>{if(e.name!=='AbortError')setError(String(e))});return()=>controller.abort()},[])
  if(error)return <div className="loading-page"><XCircle size={36}/><h1>暂时无法加载题库</h1><p>{error}</p><button className="button primary" onClick={()=>location.reload()}>重新加载</button></div>
  if(!bank)return <div className="loading-page"><span className="brand-symbol"><BookCheck size={27}/></span><h1>ISTQB 练习室</h1><p>正在准备你的学习空间…</p><div className="loading-line"/></div>
  return <StudyProvider bank={bank}><BrowserRouter><Shell/></BrowserRouter></StudyProvider>
}
