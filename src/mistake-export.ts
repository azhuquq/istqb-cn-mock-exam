import type {Question, StudyState} from './types'

export function createMistakeExport(questions: Question[], state: StudyState, bankVersion: string, siteUrl: string, now = new Date()) {
  const site = new URL(siteUrl)
  if (!['https:','http:'].includes(site.protocol)) throw new Error('无法确定当前网站地址，请通过网站页面导出。')
  const siteOrigin = site.origin
  const byId = new Map(questions.map(q=>[q.id,q]))
  const absoluteImages = (images: string[]) => images.map(path=>new URL(path,`${siteOrigin}/`).href)
  const items = state.mistakes.map(id=>{
    const q=byId.get(id)
    if(!q)throw new Error(`错题 ${id} 的题目内容尚未加载，无法完整导出，请刷新后重试。`)
    const response=state.mistakeResponses[id]
    return {...q,
      options:q.options.map(option=>({...option})),
      correctAnswers:[...q.correctAnswers],
      bankVersion:response?.bankVersion||bankVersion,
      selectedAnswers:response?[...response.answers]:null,
      submitted:response?.submitted??false,
      answerSource:response?.source??null,
      stemImages:absoluteImages(q.stemImages),
      sourceImages:absoluteImages(q.sourceImages),
      answerImages:absoluteImages(q.answerImages),
    }
  })
  return {format:'istqb-mistakes',version:1,exportedAt:now.toISOString(),siteOrigin,total:items.length,questions:items}
}
