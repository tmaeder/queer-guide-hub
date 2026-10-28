interface RpcError { message: string; code?: string }
interface RpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: RpcError | null }>
}
export interface CityWriteSnapshot {
  id: string
  row_version: string
  updated_at: string
  field_provenance: Record<string, unknown> | null
  enrichment_status: Record<string, unknown> | null
}

/** The database locks/rechecks the snapshot and review holds before any write. */
export async function applyCityFactualPatch(
  client: RpcClient,
  city: CityWriteSnapshot,
  patch: Record<string, unknown>,
  aliases: Array<{ alias: string; locale: string | null }> = [],
): Promise<{ error: RpcError | null; blocked: string | null; aliasesWritten: number }> {
  const { data, error } = await client.rpc('apply_city_factual_patch', {
    p_city_id: city.id,
    p_expected_row_version: city.row_version,
    p_expected_updated_at: city.updated_at,
    p_expected_provenance: city.field_provenance,
    p_expected_status: city.enrichment_status,
    p_patch: patch,
    p_aliases: aliases,
  })
  if (error) return { error, blocked: null, aliasesWritten: 0 }
  if (data && typeof data === 'object' && 'status' in data) {
    if (data.status === 'updated') {
      const count = 'aliases_written' in data ? data.aliases_written : null
      if (typeof count === 'number' && Number.isInteger(count) && count >= 0 && count <= aliases.length) {
        return { error: null, blocked: null, aliasesWritten: count }
      }
    }
    if (data.status === 'blocked' && 'reason' in data && typeof data.reason === 'string'
      && ['human_hold','stale_snapshot','missing_or_retired_city','review_sweep_running'].includes(data.reason)) {
      return { error: null, blocked: data.reason, aliasesWritten: 0 }
    }
  }
  return { error: { message: 'city_factual_patch_response_invalid' }, blocked: null, aliasesWritten: 0 }
}
