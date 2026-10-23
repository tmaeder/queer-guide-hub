/** Keep credential/network failures distinct from a successful empty lookup. */
export class ProviderUnavailable extends Error {
  constructor(readonly httpStatus?: number) {
    super(httpStatus ? `Provider returned HTTP ${httpStatus}` : 'Provider request unavailable')
  }
}

export async function providerFetch(url: string, init: RequestInit = {}): Promise<Response> {
  let response: Response
  try {
    response = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(15_000) })
  } catch {
    // Fetch errors can contain a URL with its API key. Never return that text.
    throw new ProviderUnavailable()
  }
  if (!response.ok) {
    await response.body?.cancel()
    throw new ProviderUnavailable(response.status)
  }
  return response
}

export function providerResults<T>(sources: string[], results: PromiseSettledResult<T | null>[]) {
  if (sources.length !== results.length) throw new Error('Provider result cardinality mismatch')
  return results.map((result, index) => ({
    source: sources[index],
    status: result.status,
    outcome: result.status === 'rejected' ? 'unavailable' : result.value === null ? 'empty' : 'found',
    data: result.status === 'fulfilled' ? result.value : null,
    ...(result.status === 'rejected' ? {
      error: result.reason instanceof ProviderUnavailable ? result.reason.message : 'Provider request unavailable',
      http_status: result.reason instanceof ProviderUnavailable ? result.reason.httpStatus ?? null : null,
    } : {}),
  }))
}
