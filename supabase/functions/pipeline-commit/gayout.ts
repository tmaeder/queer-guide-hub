import postgres from 'npm:postgres@3.4.5'
import { combineStagingSources, type CombinationRpcClient } from './combine-sources.ts'

export interface GayOutCommitRow { staging_id: string; entity_id: string | null; action: string }

/** Keep the established combination and commit gates in one bounded database
 * transaction. These are fixed, parameterised calls; no caller supplies SQL. */
export async function commitGayOutDirect(connectionString: string, run: string, table: string, limit: number): Promise<GayOutCommitRow[]> {
  if (!['venues', 'organizations', 'events'].includes(table)) throw new Error('Invalid GayOut commit target')
  const client = postgres(connectionString, { max: 1, prepare: false, connect_timeout: 10,
    idle_timeout: 5, max_lifetime: 30, ssl: 'require' })
  try {
    return await client.begin(async transaction => {
      // Preserve the same database privileges as the authenticated internal API.
      await transaction`set local role service_role`
      // Match the role context normally established by PostgREST. The caller
      // has already passed the endpoint's internal-or-admin authentication.
      await transaction`select set_config('request.jwt.claim.role', 'service_role', true), set_config('request.jwt.claims', '{"role":"service_role"}', true)`
      await transaction`set local statement_timeout = '60s'`
      await transaction`set local lock_timeout = '5s'`
      await transaction`set local idle_in_transaction_session_timeout = '15s'`
      const rpc: CombinationRpcClient = {
        async rpc(name, args) {
          if (name === 'load_source_combination_batch') {
            const rows = await transaction`select public.load_source_combination_batch(${table}::text, ${run}::uuid, ${limit}::integer) as data`
            return { data: rows[0].data, error: null }
          }
          if (name === 'apply_source_combination_batch') {
            const rows = await transaction`select public.apply_source_combination_batch(${JSON.stringify(args.p_groups)}::text::jsonb) as data`
            return { data: rows[0].data, error: null }
          }
          throw new Error('Unsupported GayOut combination call')
        },
      }
      // Check source/run ownership before any combination writes.
      const active = await transaction`select 1 from public.pipeline_runs where id=${run}::uuid and pipeline_name='gayout-weekly-sync' and status='running'`
      if (!active.length) throw new Error('GayOut run is not active')
      await combineStagingSources(rpc, table, run, limit)
      const rows = await transaction`select * from public.commit_gayout_staging_batch(${run}::uuid, ${table}::text, ${limit}::integer)`
      return Array.from(rows) as GayOutCommitRow[]
    })
  } finally {
    await client.end({ timeout: 5 })
  }
}
