import type {Attempt, FormalPaper, Question, StudyState} from './types'
import {isStoredMixedSeed, type MixedPaper} from './mixed'

export const STORAGE_KEY = 'istqb-study-v1'
export const CHAPTERS = ['测试基础', '整个软件开发生命周期中的测试', '静态测试', '测试分析与设计', '管理测试活动', '测试工具']
export const EXAM_DURATION = 60 * 60 * 1000
export const freshState = (): StudyState => ({schemaVersion: 1, practice: {filter: 'paper:A', index: 0, answers: {}, submitted: {}}, activeExam: null, history: [], mistakes: []})
export function isCorrect(selected: string[] = [], expected: string[]) {
  return selected.length === expected.length && new Set(selected).size === selected.length && expected.every(id => selected.includes(id))
}
export function toggleOption(selected: string[], option: string, count: number) {
  return count === 1 ? (selected.includes(option) ? [] : [option]) : selected.includes(option) ? selected.filter(id => id !== option) : [...selected, option]
}
export function startAttempt(paper: string, questions: Question[], now = Date.now()): Attempt {
  if (!/^[A-D]$/.test(paper)) throw new Error('没有找到这套试卷。')
  return {id: crypto.randomUUID(), paper: paper as FormalPaper, questionIds: questions.filter(q => q.paper === paper && !q.supplementary).map(q => q.id), answers: {}, flags: [], startedAt: now, deadline: now + EXAM_DURATION, endedAt: null, status: 'active', index: 0}
}
export const examName = (paper: string) => paper === 'mixed' ? '混合模拟' : `模拟卷 ${paper}`
export function startMixedAttempt(paper: MixedPaper, now = Date.now()): Attempt {
  return {id: crypto.randomUUID(), paper: 'mixed', seed: paper.seed, questionIds: [...paper.questionIds],
    answers: {}, flags: [], startedAt: now, deadline: now + EXAM_DURATION, endedAt: null, status: 'active', index: 0}
}
export function remaining(attempt: Attempt, now = Date.now()) {return Math.max(0, attempt.deadline - now)}
export function abandonState(state: StudyState): StudyState {
  return state.activeExam ? {...state, activeExam: null} : state
}
export function finishState(state: StudyState, questions: Question[], now = Date.now()): StudyState {
  const active = state.activeExam
  if (!active) return state
  const completed: Attempt = {...active, status: 'completed', endedAt: Math.max(active.startedAt, Math.min(now, active.deadline))}
  const wrong = questions.filter(q => active.questionIds.includes(q.id) && active.answers[q.id]?.length > 0 && !isCorrect(active.answers[q.id], q.correctAnswers)).map(q => q.id)
  return {...state, activeExam: null, history: [completed, ...state.history.filter(a => a.id !== completed.id)], mistakes: [...new Set([...state.mistakes, ...wrong])]}
}
export function getResult(attempt: Attempt, questions: Question[]) {
  const items = attempt.questionIds.map(id => questions.find(q => q.id === id)).filter((q): q is Question => !!q)
  const correct = items.filter(q => isCorrect(attempt.answers[q.id], q.correctAnswers))
  const score = correct.reduce((sum,q) => sum+q.points,0)
  return {score, passed: score >= 26, total: items.length, correct: correct.length,
    unanswered: items.filter(q => !attempt.answers[q.id]?.length).length,
    chapters: CHAPTERS.map((name,i) => ({name, total: items.filter(q => q.chapter === i+1).length, correct: correct.filter(q => q.chapter === i+1).length}))}
}
export function formatTime(ms: number) {
  const seconds = Math.ceil(Math.max(0, ms) / 1000)
  return `${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`
}
export function filterQuestions(questions: Question[], filter: string, mistakes: string[]) {
  const [kind,value] = filter.split(':')
  if (kind === 'chapter') return questions.filter(q => q.chapter === Number(value))
  if (kind === 'extra') return questions.filter(q => q.supplementary)
  if (kind === 'mistakes') return questions.filter(q => mistakes.includes(q.id))
  return questions.filter(q => q.paper === value && !q.supplementary)
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(x => typeof x === 'string')
const questionId = (value: string) => /^(?:[A-D]-(?:[1-9]|[1-3]\d|40)|A-A(?:[1-9]|1\d|2[0-6]))$/.test(value)
const answers = (value: unknown): value is Record<string,string[]> => record(value) && Object.entries(value).every(([id,v]) => questionId(id) && strings(v) && v.every(x => /^[A-E]$/.test(x)))
function validAttempt(value: unknown): value is Attempt {
  if (!record(value) || typeof value.id !== 'string' || !(value.paper === 'mixed' || /^[A-D]$/.test(String(value.paper))) || !strings(value.questionIds) || value.questionIds.length !== 40 || !answers(value.answers) || !strings(value.flags)) return false
  const ids=value.questionIds
  const validQuestions = value.paper === 'mixed'
    ? isStoredMixedSeed(value.seed) && new Set(ids).size === 40 && ids.every(questionId)
    : value.seed === undefined && ids.every((id,i)=>id===`${value.paper}-${i+1}`)
  return validQuestions && Object.keys(value.answers).every(id=>ids.includes(id)) && value.flags.every(id=>ids.includes(id))
    && Number.isFinite(value.startedAt) && Number.isFinite(value.deadline) && Number(value.deadline) > Number(value.startedAt)
    && Number.isInteger(value.index) && Number(value.index) >= 0 && Number(value.index) < 40
    && ((value.status === 'active' && value.endedAt === null) || (value.status === 'completed' && Number.isFinite(value.endedAt) && Number(value.endedAt)>=Number(value.startedAt) && Number(value.endedAt)<=Number(value.deadline)))
}
export function parseState(raw: string | null): StudyState {
  if (!raw) return freshState()
  const value: unknown = JSON.parse(raw)
  if (!record(value) || value.schemaVersion !== 1 || !record(value.practice) || typeof value.practice.filter !== 'string' || !Number.isInteger(value.practice.index) || Number(value.practice.index) < 0
      || !answers(value.practice.answers) || !record(value.practice.submitted) || !Object.entries(value.practice.submitted).every(([id,v]) => questionId(id) && typeof v === 'boolean')
      || !strings(value.mistakes) || !value.mistakes.every(questionId) || !Array.isArray(value.history) || !value.history.every(v => validAttempt(v) && v.status === 'completed')
      || (value.activeExam !== null && (!validAttempt(value.activeExam) || value.activeExam.status !== 'active'))) throw new Error('本地记录格式不兼容或已损坏。原记录已保留，请先导出备份再重置。')
  return value as unknown as StudyState
}
