import fs from 'node:fs'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {canonicalBank} from '../src/bank-format.mjs'

export const fingerprint = bank => createHash('sha256').update(canonicalBank(bank)).digest('hex').slice(0,12).toUpperCase()
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
export function assetFingerprint(bank) {
  const paths=[...new Set(bank.questions.flatMap(q=>[...q.sourceImages,...q.answerImages,...q.stemImages])
    .concat(bank.sources.flatMap(s=>[`/sources/${s.questionFile}`,`/sources/${s.answerFile}`])))].sort()
  return sha256(JSON.stringify(paths.map(path=>{
    assert.ok(path.startsWith('/questions/')||path.startsWith('/sources/'))
    assert.ok(!path.includes('..')&&!path.includes('\\'))
    return [path,sha256(fs.readFileSync(new URL('../public'+path.split('/').map(encodeURIComponent).join('/'),import.meta.url)))]
  })))
}
export function validateReleases({workingCopy=true} = {}) {
  const releases=JSON.parse(fs.readFileSync(new URL('../public/data/releases.json',import.meta.url),'utf8'))
  assert.equal(releases.version,1)
  assert.ok(Object.hasOwn(releases.banks,releases.currentBank),'current bank is not registered')
  assert.ok(Object.hasOwn(releases.algorithms,releases.currentAlgorithm),'current algorithm is not registered')
  const fingerprints=new Set()
  const seedIds=new Set()
  for(const [version,release] of Object.entries(releases.banks)) {
    assert.ok(Number.isInteger(release.seedId)&&release.seedId>0&&release.seedId<=0xffffffff,'invalid bank seed ID')
    assert.ok(!seedIds.has(release.seedId),'duplicate bank seed ID; IDs must never be reused')
    seedIds.add(release.seedId)
    assert.match(version,/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/)
    assert.equal(release.path,`/data/banks/${version}.json`)
    const bytes=fs.readFileSync(new URL('../public'+release.path,import.meta.url))
    assert.equal(sha256(bytes),release.sha256,`frozen bank ${version} changed; publish a new version`)
    const bank=JSON.parse(bytes)
    assert.equal(bank.version,1)
    assert.equal(bank.bankVersion,version)
    assert.equal(fingerprint(bank),release.fingerprint)
    assert.equal(assetFingerprint(bank),release.assetsSha256,`frozen assets for bank ${version} changed`)
    assert.ok(!fingerprints.has(release.fingerprint),'duplicate bank content; no new release needed')
    fingerprints.add(release.fingerprint)
    if(workingCopy&&version===releases.currentBank) {
      assert.equal(fs.readFileSync(new URL('../public/data/questions.json',import.meta.url),'utf8'),bytes.toString(),'working bank differs from its release; run bank:release with a new version')
    }
  }
  for(const [version,release] of Object.entries(releases.algorithms)) {
    assert.match(version,/^M[1-9]\d{0,2}$/)
    assert.equal(release.path,`src/algorithms/${version.toLowerCase()}.ts`)
    const bytes=fs.readFileSync(new URL('../'+release.path,import.meta.url))
    assert.equal(sha256(bytes),release.sha256,`frozen algorithm ${version} changed; register a new version`)
  }
  return releases
}
