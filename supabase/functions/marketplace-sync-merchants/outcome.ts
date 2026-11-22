// One storefront failing upstream (Shopify INTERNAL_SERVER_ERROR, a locked store) is that
// merchant's problem: it is stamped on marketplace_merchants.last_sync_status and counted in
// items_failed. Only a run where every attempted merchant failed is a systemic failure, which
// is what the automation's auto-pause should count. Before 2026-11-22 one failing merchant per
// hourly batch of six failed the whole run and auto-paused the job.
export function runSucceeded(results: Array<{ status?: unknown }>): boolean {
  const attempted = results.filter(r => r.status === 'ok' || r.status === 'error')
  return attempted.length === 0 || attempted.some(r => r.status === 'ok')
}
