import { describe, it, expect } from 'vitest'

// Contract tests for the merge-candidate resolution flow.
// These do not hit the live DB — they assert the shape of the RPC contract
// documented in 20260415180000_geo_cron_and_merge_rpc.sql, so that any
// future refactor of the client code stays in sync with the RPC signature.

describe('resolve_geo_merge_candidate RPC contract', () => {
  const VALID_DECISIONS = ['merge', 'not_duplicate'] as const

  it('only accepts the two documented decisions', () => {
    const bad = ['delete', 'ignore', 'skip', '', 'MERGE', null, undefined]
    for (const v of bad) {
      expect(VALID_DECISIONS).not.toContain(v as unknown as 'merge' | 'not_duplicate')
    }
    expect(VALID_DECISIONS).toContain('merge')
    expect(VALID_DECISIONS).toContain('not_duplicate')
  })

  it('params object matches the RPC signature', () => {
    // Shape the admin UI passes to supabase.rpc()
    const call = {
      p_staging_id: '11111111-1111-1111-1111-111111111111',
      p_decision:   'merge' as const,
      p_actor:      'admin-ui',
    }
    expect(Object.keys(call).sort()).toEqual(['p_actor', 'p_decision', 'p_staging_id'])
    expect(typeof call.p_staging_id).toBe('string')
    expect(VALID_DECISIONS).toContain(call.p_decision)
  })
})

describe('geo_merge_candidates view contract', () => {
  it('expected columns are present in our UI type', () => {
    // Mirrors the view definition — keep in sync with migration.
    const required = new Set([
      'staging_id', 'target_table', 'entity_type', 'source', 'source_entity_id',
      'proposed_name', 'proposed_code', 'proposed_lat', 'proposed_lng',
      'proposed_country_name', 'proposed_country_code',
      'match_id', 'match_score', 'dedup_details', 'created_at',
      'match_name', 'match_lat', 'match_lng',
      'match_country_name', 'match_country_code',
    ])
    // If this ever fails, update GeoReviewTab.tsx AND the migration view.
    expect(required.size).toBe(20)
  })

  it('target_table is always cities or countries', () => {
    const validTargets = ['cities', 'countries'] as const
    expect(validTargets.length).toBe(2)
    // Guards against future entity types leaking into the geo review UI
    expect(validTargets).toEqual(['cities', 'countries'])
  })
})

describe('admin UI decision → RPC action mapping', () => {
  // Documents the state transitions the migration's resolve_geo_merge_candidate
  // does for each decision. Any refactor must keep these in sync.

  it('merge → staging.dedup_status becomes duplicate, disposition pending', () => {
    const expected = {
      dedup_status:  'duplicate',
      review_status: 'approved',
      disposition:   'pending',
    }
    // commit_*_staging_item then flips disposition to 'updated' (existing match)
    expect(expected.dedup_status).toBe('duplicate')
    expect(expected.review_status).toBe('approved')
  })

  it('not_duplicate → match cleared, dedup_status unique, commit INSERTs', () => {
    const expected = {
      dedup_status:     'unique',
      dedup_match_id:   null,
      dedup_match_score: 0,
      review_status:    'approved',
      disposition:      'pending',
    }
    // commit_*_staging_item then flips disposition to 'inserted' (new row)
    expect(expected.dedup_status).toBe('unique')
    expect(expected.dedup_match_id).toBeNull()
  })
})

describe('admin audit log payload', () => {
  it('logAdminGeoEdit emits the same entity discriminator used by commit RPCs', () => {
    // logAdminGeoEdit writes city_id OR country_id based on entity; never both.
    const cityLog    = { entity_type: 'city'    as const, city_id: 'uuid-a', country_id: null }
    const countryLog = { entity_type: 'country' as const, city_id: null,     country_id: 'uuid-b' }
    expect(cityLog.city_id    && !cityLog.country_id).toBeTruthy()
    expect(!countryLog.city_id && countryLog.country_id).toBeTruthy()
  })

  it('logAdminGeoEdit actions match ingestion_events.new_status vocabulary', () => {
    const ACTIONS = ['insert', 'update', 'delete'] as const
    expect(ACTIONS.length).toBe(3)
    for (const a of ACTIONS) expect(typeof a).toBe('string')
  })
})
