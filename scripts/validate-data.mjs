import fs from 'node:fs'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {validateReleases} from './validate-releases.mjs'
export function validateBank(bank) {
assert.equal(bank.version,1)
assert.deepEqual(bank.sources.map(source=>source.paper),[...'ABCD'])
for(const source of bank.sources){
  for(const kind of ['question','answer']){
    const filename=source[`${kind}File`]
    assert.ok(filename.endsWith('.pdf')&&!/[\\/]/.test(filename),'invalid source filename')
    const pdf=fs.readFileSync(new URL('../public/sources/'+encodeURIComponent(filename),import.meta.url))
    assert.equal(pdf.subarray(0,5).toString(),'%PDF-','source is not a PDF: '+filename)
    assert.equal(createHash('sha256').update(pdf).digest('hex'),source[`${kind}Sha256`],'original PDF changed: '+filename)
  }
}
assert.equal(bank.questions.length,186)
assert.equal(new Set(bank.questions.map(q=>q.id)).size,186)
const chapterDistribution=[8,6,4,11,9,2]
const counts={}
for(const paper of 'ABCD'){
  const formal=bank.questions.filter(q=>q.paper===paper&&!q.supplementary)
  assert.equal(formal.length,40)
  assert.deepEqual(formal.map(q=>q.number),Array.from({length:40},(_,i)=>String(i+1)))
  assert.deepEqual(chapterDistribution,chapterDistribution.map((_,i)=>formal.filter(q=>q.chapter===i+1).length))
  counts[paper]=bank.questions.filter(q=>q.paper===paper).length
}
assert.equal(bank.questions.filter(q=>q.supplementary).length,26)
for(const q of bank.questions){
  const fail=(value,message)=>assert.ok(value,`${q.id}: ${message}`)
  fail(q.stem?.length>5,'missing question stem')
  fail(q.explanation?.length>15,'missing explanation')
  fail(!/^[b-e][)）]/i.test(q.explanation),'explanation starts after option A')
  fail(q.options.length>=4&&q.options.length<=5,'invalid option count')
  assert.deepEqual(q.options.map(o=>o.id),'ABCDE'.slice(0,q.options.length).split(''),q.id)
  fail(q.options.every(o=>o.text.trim().length>0),'empty option')
  fail(q.correctAnswers.every(id=>q.options.some(o=>o.id===id)),'invalid correct answer')
  fail(q.selectionCount===q.correctAnswers.length,'selection count differs from answer')
  fail(q.points===1,'unexpected score')
  fail(/^FL-[1-6]\.\d+\.\d+$/.test(q.learningObjective),'invalid learning objective')
  fail(['K1','K2','K3'].includes(q.level),'invalid knowledge level')
  if(/选择[两二]个选项|选择两项/.test(q.stem))fail(q.selectionCount===2,'multiple-choice prompt mismatch')
  if(/选择一个选项/.test(q.stem))fail(q.selectionCount===1,'single-choice prompt mismatch')
  fail(!/©|认证测试工程师基础级模拟题|2025 年 12 月 11 日/.test(q.stem+q.explanation),'page header/footer contamination')
  fail(q.sourceImages.length&&q.answerImages.length,'missing source images')
  for(const image of [...q.sourceImages,...q.answerImages,...q.stemImages])fail(fs.existsSync(new URL('../public'+image,import.meta.url)),'missing image '+image)
}
for(const id of ['A-14','A-33','A-A6','C-31'])assert.ok(bank.questions.find(q=>q.id===id).stemImages.length,`${id}: required table/chart missing`)
assert.ok(bank.questions.find(q=>q.id==='B-13').explanation.includes('系统规格说明'),'B-13: first explanation paragraph missing')
console.log(`Validated ${bank.questions.length} questions (${JSON.stringify(counts)}), answers, chapters, explanations, source images and 8 original PDFs (SHA-256).`)

}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const bank=JSON.parse(fs.readFileSync(new URL('../public/data/questions.json',import.meta.url),'utf8'))
  validateBank(bank)
  validateReleases()
}
