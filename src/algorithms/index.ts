import {generateM1, MIXED_GROUPS, MIXED_QUOTAS, STRUCTURE_URL} from './m1'
import {CURRENT_ALGORITHM_VERSION} from '../versions'
import releases from '../../public/data/releases.json'

// Keep released implementations registered when adding a new default version.
export const ALGORITHMS = {M1: {generate:generateM1,groups:MIXED_GROUPS,quotas:MIXED_QUOTAS,structureURL:STRUCTURE_URL}} satisfies Record<keyof typeof releases.algorithms,{
  generate:typeof generateM1; groups:typeof MIXED_GROUPS; quotas:readonly (readonly number[])[]; structureURL:string;
}>
export function getAlgorithm(version: string) {
  if (!Object.hasOwn(ALGORITHMS,version)) throw new Error(`抽题算法版本 ${version} 不受支持。`)
  return ALGORITHMS[version as keyof typeof ALGORITHMS]
}
export const currentAlgorithm = getAlgorithm(CURRENT_ALGORITHM_VERSION)
