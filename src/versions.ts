import releases from '../public/data/releases.json'

export const CURRENT_BANK_VERSION = releases.currentBank
export const CURRENT_ALGORITHM_VERSION = releases.currentAlgorithm
export const LEGACY_BANK_VERSION = '1.0.0'
export const BANK_RELEASES = releases.banks as Record<string,{seedId:number;path:string;fingerprint:string;sha256:string}>
export const isBankVersion = (value: unknown): value is string => typeof value === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)
