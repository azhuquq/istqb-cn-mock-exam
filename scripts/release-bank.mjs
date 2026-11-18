import fs from 'node:fs'
import assert from 'node:assert/strict'
import {validateBank} from './validate-data.mjs'
import {assetFingerprint, fingerprint, sha256, validateReleases} from './validate-releases.mjs'

// Prepare a new local release; publishing the website remains a separate action.
const version=process.argv[2]
assert.ok(version&&/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version),'usage: npm run bank:release -- <major.minor.patch>')
const releases=validateReleases({workingCopy:false})
assert.ok(!Object.hasOwn(releases.banks,version),`bank ${version} already exists and cannot be overwritten`)
const next=version.split('.').map(Number), previous=releases.currentBank.split('.').map(Number)
const changed=next.findIndex((n,i)=>n!==previous[i])
assert.ok(changed>=0&&next[changed]>previous[changed],'new bank version must be greater than the current version')
const bank=JSON.parse(fs.readFileSync(new URL('../public/data/questions.json',import.meta.url),'utf8'))
validateBank(bank)
bank.bankVersion=version
const content=JSON.stringify(bank,null,2)+'\n'
const digest=fingerprint(bank)
const assetsSha256=assetFingerprint(bank)
const seedId=Math.max(...Object.values(releases.banks).map(release=>release.seedId))+1
assert.ok(seedId<=0xffffffff,'bank seed ID space exhausted')
assert.ok(!Object.values(releases.banks).some(release=>release.fingerprint===digest),'bank content has not changed')
const destination=new URL(`../public/data/banks/${version}.json`,import.meta.url)
fs.writeFileSync(destination,content,{flag:'wx'})
releases.banks[version]={seedId,path:`/data/banks/${version}.json`,fingerprint:digest,sha256:sha256(content),assetsSha256}
releases.currentBank=version
fs.writeFileSync(new URL('../public/data/questions.json',import.meta.url),content)
fs.writeFileSync(new URL('../public/data/releases.json',import.meta.url),JSON.stringify(releases,null,2)+'\n')
console.log(`Prepared immutable bank ${version}; review the changes before deploying.`)
