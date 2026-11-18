// Fingerprint format 1 is frozen for compatibility with existing M1 seeds.
const compare = (a,b) => a < b ? -1 : a > b ? 1 : 0
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).sort(([a],[b]) => compare(a,b)).map(([key,item]) => [key,canonical(item)]),
  )
  return value
}
export function canonicalBank(bank) {
  // Content version is metadata, separate from the original content fingerprint.
  const {bankVersion, ...content} = bank
  return JSON.stringify(canonical({...content,
    questions: [...bank.questions].sort((a,b) => compare(a.id,b.id)),
    sources: [...bank.sources].sort((a,b) => compare(a.paper,b.paper)),
  }))
}
