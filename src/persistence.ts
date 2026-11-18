import {parseState} from './core'
import type {StudyState} from './types'

// Remote snapshots must not be echoed back to localStorage: two windows can
// otherwise keep replaying one another's queued, older storage events.
export class StudyPersistence {
  private snapshot: string | null = null
  constructor(private write: (serialized: string) => void) {}

  save(state: StudyState) {
    const serialized = JSON.stringify(state)
    if (serialized === this.snapshot) return
    this.write(serialized)
    this.snapshot = serialized
  }

  receive(raw: string | null): StudyState {
    const state = parseState(raw)
    this.snapshot = JSON.stringify(state)
    return state
  }
}
