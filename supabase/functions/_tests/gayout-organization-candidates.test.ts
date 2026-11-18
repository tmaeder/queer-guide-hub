import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import postgres from 'npm:postgres@3.4.5'
import { GAYOUT_ORGANIZATION_CANDIDATES_SQL } from '../pipeline-deduplicate/gayout-organizations.ts'

// Optional PostgreSQL contract test. Reads the installed legacy implementation
// and compares both queries over the same tiny CTE fixtures, without schema or
// canonical writes. Run with GAYOUT_TEST_DB_URL against a migrated test database.
const connection = Deno.env.get('GAYOUT_TEST_DB_URL')
const fixture = `fixtures(id,name,website_domain) as (values
  ('00000000-0000-0000-0000-000000000001'::uuid,'ABUniverse','example.org'),
  ('00000000-0000-0000-0000-000000000002'::uuid,'Ab universe','elsewhere.org'),
  ('00000000-0000-0000-0000-000000000003'::uuid,'Café Zürich','cafe.test'),
  ('00000000-0000-0000-0000-000000000004'::uuid,'Different Group','example.org'),
  ('00000000-0000-0000-0000-000000000005'::uuid,'Queer Foundation 1234',null),
  ('00000000-0000-0000-0000-000000000006'::uuid,'Queer Foundation 1235',null),
  ('00000000-0000-0000-0000-000000000007'::uuid,'非営利組織','unicode.test'))`
const inputs: Array<[string | null, string | null, number]> = [
  ['ABUniverse', ' example.org ', 10], ['Ab universe', null, 10],
  ['Cafe Zurich', 'CAFE.TEST', 10], ['Queer Foundation 1234', null, 10],
  ['missing', null, 10], ['非営利組織', null, 10], ['   ', null, 10],
  ['ABUniverse', null, 1], [null, 'example.org', 50],
]
const withFixtures = (query: string) => query.replaceAll('public.organizations', 'fixtures')
  .replace(/^\s*with\s+/i, 'with ' + fixture + ', ')

Deno.test({
  name: 'GayOut organization query preserves legacy candidates and scores',
  ignore: !connection,
  async fn() {
    const client = postgres(connection!, { max: 1, prepare: false })
    try {
      await client.begin(async tx => {
        await tx`set transaction read only`
        await tx`set local statement_timeout = '15s'`
        const [row] = await tx`select pg_get_functiondef(oid) definition from pg_proc
          where proname='find_organization_duplicate_candidates' and pronamespace='public'::regnamespace`
        const definition = String(row.definition)
        const body = definition.match(/AS \$function\$([\s\S]*?)\$function\$/)?.[1]
        if (!body) throw new Error('Expected installed SQL candidate function')
        const legacy = body.trim().replace(/;$/, '')
          .replace(/\bp_website_domain\b/g, '$2::text').replace(/\bp_name\b/g, '$1::text')
          .replace(/\bp_limit\b/g, '$3::integer')
          .replace('q.oid, q.mt, q.sc, NULL::double precision',
            'q.oid organization_id, q.mt match_type, q.sc score, NULL::double precision distance_m')
        const canonical = (rows: postgres.RowList<postgres.Row[]>) => Array.from(rows)
          .map(row => ({ ...row, organization_id: String(row.organization_id), score: Number(row.score).toFixed(6) }))
          .sort((a, b) => String(a.organization_id).localeCompare(String(b.organization_id)))
        for (const input of inputs) {
          assertEquals(canonical(await tx.unsafe(withFixtures(GAYOUT_ORGANIZATION_CANDIDATES_SQL), input)),
            canonical(await tx.unsafe(withFixtures(legacy), input)), JSON.stringify(input))
        }
      })
    } finally { await client.end({ timeout: 5 }) }
  },
})
