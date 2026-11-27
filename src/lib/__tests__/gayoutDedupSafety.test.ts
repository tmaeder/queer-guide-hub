import { describe, expect, it } from 'vitest'
import { requireGayOutCandidateSearch } from '../../../supabase/functions/pipeline-deduplicate/gayout'

describe('GayOut duplicate search safety', () => {
  it('does not turn a database timeout into a unique verdict', () => {
    for (const stage of ['deterministic', 'semantic']) {
      expect(() => requireGayOutCandidateSearch('gayout', { message: 'statement timeout' }, false, stage)).toThrow('search incomplete')
    }
  })
  it('holds records when the candidate circuit is open', () => {
    expect(() => requireGayOutCandidateSearch('gayout', null, true, 'deterministic')).toThrow('circuit open')
  })
  it('accepts completed searches and preserves other source policies', () => {
    expect(() => requireGayOutCandidateSearch('gayout', null, false, 'deterministic')).not.toThrow()
    expect(() => requireGayOutCandidateSearch('other', { message: 'timeout' }, true, 'deterministic')).not.toThrow()
  })
})
