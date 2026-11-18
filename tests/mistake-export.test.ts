import {describe, expect, it} from 'vitest'
import {readFileSync} from 'node:fs'
import {createMistakeExport} from '../src/mistake-export'
import {freshState} from '../src/core'
import type {Bank, MistakeResponse} from '../src/types'

const bank: Bank=JSON.parse(readFileSync(new URL('../public/data/questions.json',import.meta.url),'utf8'))
const now=new Date('2026-11-19T01:02:03.000Z')
const response=(answers:string[]):MistakeResponse=>({answers,submitted:true,source:'exam',bankVersion:'1.0.0'})

describe('mistake notebook JSON export',()=>{
  it('exports all stored mistakes with full stems, options, recorded answers and explanations',()=>{
    const [first,second]=[bank.questions.find(q=>q.id==='A-1')!,bank.questions.find(q=>q.id==='D-30')!]
    const state={...freshState(),mistakes:[second.id,first.id],mistakeResponses:{[first.id]:response(['C']),[second.id]:response(['A','D'])}}
    const before=structuredClone({state,first,second})
    const data=createMistakeExport([first,second],state,bank.bankVersion,'https://example.com/mistakes?chapter=1',now)
    const parsed=JSON.parse(JSON.stringify(data))
    expect(parsed).toMatchObject({format:'istqb-mistakes',version:1,exportedAt:now.toISOString(),siteOrigin:'https://example.com',total:2})
    expect(parsed.questions.map((q:{id:string})=>q.id)).toEqual([second.id,first.id])
    expect(parsed.questions[0]).toMatchObject({stem:second.stem,options:second.options,selectedAnswers:['A','D'],correctAnswers:second.correctAnswers,explanation:second.explanation,submitted:true,answerSource:'exam',bankVersion:'1.0.0'})
    expect(parsed.questions[1].stem).toBe(first.stem)
    expect({state,first,second}).toEqual(before)
    // A filtered chapter's subset must never silently produce a partial export.
    expect(()=>createMistakeExport([first],state,bank.bankVersion,'https://example.com')).toThrow(second.id)
  })
  it('resolves stem, original-question and explanation images against the actual deployment origin',()=>{
    const q=structuredClone(bank.questions.find(q=>q.stemImages.length)!)
    q.stemImages=['/questions/题干 图.webp']
    q.sourceImages=['/questions/version-2/original.webp']
    q.answerImages=['/questions/explanation.webp','https://cdn.example.com/answer.webp']
    const state={...freshState(),mistakes:[q.id]}
    for(const origin of ['https://preview.example.com','http://localhost:5173','https://production.example.com:8443']) {
      const data=createMistakeExport([q],state,bank.bankVersion,`${origin}/mistakes`,now)
      expect(data.questions[0].stemImages).toEqual([`${origin}/questions/%E9%A2%98%E5%B9%B2%20%E5%9B%BE.webp`])
      expect(data.questions[0].sourceImages).toEqual([`${origin}/questions/version-2/original.webp`])
      expect(data.questions[0].answerImages).toEqual([`${origin}/questions/explanation.webp`,'https://cdn.example.com/answer.webp'])
    }
    expect(q.stemImages).toEqual(['/questions/题干 图.webp'])
  })
  it('exports the supplied historical question version and distinguishes drafts from missing answers',()=>{
    const q=structuredClone(bank.questions[0]);q.stem='旧版题干\n包含“引号”和中文';q.explanation='旧版解析\n第二行'
    const state={...freshState(),mistakes:[q.id],mistakeResponses:{[q.id]:{...response(['D']),bankVersion:'0.9.0',submitted:false,source:'practice' as const}}}
    const data=createMistakeExport([q],state,'1.0.0','https://example.com',now)
    expect(data.questions[0]).toMatchObject({stem:q.stem,explanation:q.explanation,bankVersion:'0.9.0',selectedAnswers:['D'],submitted:false,answerSource:'practice'})
    const missing=createMistakeExport([q],{...freshState(),mistakes:[q.id]},bank.bankVersion,'https://example.com',now)
    expect(missing.questions[0]).toMatchObject({selectedAnswers:null,submitted:false,answerSource:null})
  })
  it('handles an empty notebook and rejects non-web deployment addresses',()=>{
    expect(createMistakeExport([],freshState(),bank.bankVersion,'https://example.com',now)).toMatchObject({total:0,questions:[]})
    expect(()=>createMistakeExport([],freshState(),bank.bankVersion,'file:///tmp/mistakes',now)).toThrow('当前网站地址')
  })
})
