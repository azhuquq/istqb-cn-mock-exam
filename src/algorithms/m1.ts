// Released M1: do not edit. Add a new module/version for any behavior change.
import type {Question} from '../types'

export const STRUCTURE_URL = 'https://istqb.org/wp-content/uploads/2026/05/ISTQB_Exam-Structure-Tables_v1.18.pdf'
// CTFL v4.0, Exam Structures & Rules v1.18, pages 4–5.
// Each row is one official LO group; the 5.3.2/5.3.3 group spans both pages.
export const MIXED_GROUPS = [
  ['K1',1,'1.1.1 1.2.2'], ['K1',1,'1.5.2'],
  ['K2',1,'1.1.2 1.2.1 1.2.3'], ['K2',1,'1.3.1'],
  ['K2',3,'1.4.1 1.4.2 1.4.3 1.4.4 1.4.5'], ['K2',1,'1.5.1 1.5.3'],
  ['K1',1,'2.1.2'], ['K1',1,'2.1.3'], ['K2',1,'2.2.1 2.2.2'],
  ['K2',1,'2.2.3 2.3.1'], ['K2',1,'2.1.1 2.1.6'], ['K2',1,'2.1.4 2.1.5'],
  ['K1',2,'3.1.1 3.2.1 3.2.3 3.2.5'], ['K2',1,'3.1.2 3.1.3'], ['K2',1,'3.2.2 3.2.4'],
  ['K2',1,'4.1.1'], ['K2',2,'4.3.1 4.3.2 4.3.3'], ['K2',2,'4.4.1 4.4.2 4.4.3'],
  ['K2',1,'4.5.1 4.5.2'], ['K3',5,'4.2.1 4.2.2 4.2.3 4.2.4 4.5.3'],
  ['K1',1,'5.1.2 5.1.6 5.2.1 5.3.1'], ['K2',1,'5.1.1 5.1.3'], ['K2',1,'5.1.7'],
  ['K2',1,'5.2.2 5.2.3 5.2.4'], ['K2',1,'5.3.2 5.3.3'], ['K2',1,'5.4.1'],
  ['K3',3,'5.1.4 5.1.5 5.5.1'], ['K2',1,'6.1.1'], ['K1',1,'6.2.1'],
].map(([level,count,objectives]) => ({
  level: level as string, count: count as number,
  objectives: (objectives as string).split(' ').map(lo => `FL-${lo}`),
}))

export const MIXED_QUOTAS = [[2,6,0],[2,4,0],[2,2,0],[0,6,5],[1,5,3],[1,1,0]] as const

const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0
    let value = Math.imul(seed ^ (seed >>> 15), seed | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}
function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items]
  for (let i = result.length-1; i > 0; i--) {
    const j = Math.floor(random() * (i+1))
    ;[result[i],result[j]] = [result[j],result[i]]
  }
  return result
}
export function generateM1(questions: Question[], value: number): string[] {
  const random = mulberry32(value)
  const selected: string[] = []
  const sorted = [...questions].sort((a,b) => compare(a.id,b.id))
  for (const group of MIXED_GROUPS) {
    const candidates = group.objectives.slice().sort(compare).map(lo => ({lo,
      items: sorted.filter(q => q.learningObjective === lo && q.level === group.level),
    }))
    if (candidates.some(c => !c.items.length) || candidates.length < group.count) {
      throw new Error(`题库不足以满足官方学习目标组 ${group.objectives.join(' / ')}，无法生成试卷。`)
    }
    for (const candidate of shuffle(candidates,random).slice(0,group.count)) {
      selected.push(candidate.items[Math.floor(random()*candidate.items.length)].id)
    }
  }
  if (selected.length !== 40 || new Set(selected).size !== 40) throw new Error('题库存在重复或缺失，无法生成试卷。')
  return shuffle(selected,random)
}
