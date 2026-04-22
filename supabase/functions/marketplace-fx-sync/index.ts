import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'

const TARGET_CURRENCIES = ['EUR','GBP','CAD','AUD','CHF','JPY','CNY','SEK','NOK','DKK','NZD','BRL','MXN','ZAR','INR','SGD','HKD','KRW','TRY','PLN','CZK','HUF']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()
  try {
    // open.er-api.com — free, no key required, updates daily
    const res = await fetch('https://open.er-api.com/v6/latest/USD')
    if (!res.ok) throw new Error(`FX API ${res.status}`)
    const data = await res.json() as { result: string; rates: Record<string, number> }
    if (data.result !== 'success' || !data.rates) throw new Error('no rates in response')

    const rows: { currency: string; rate_to_usd: number; source: string; fetched_at: string }[] = [
      { currency: 'USD', rate_to_usd: 1.0, source: 'open.er-api.com', fetched_at: new Date().toISOString() },
    ]

    for (const cur of TARGET_CURRENCIES) {
      const rateFromUsd = data.rates[cur]
      if (rateFromUsd && rateFromUsd > 0) {
        rows.push({
          currency: cur,
          rate_to_usd: Number((1 / rateFromUsd).toFixed(6)),
          source: 'open.er-api.com',
          fetched_at: new Date().toISOString(),
        })
      }
    }

    const { error } = await supabase.from('fx_rates').upsert(rows, { onConflict: 'currency' })
    if (error) throw new Error(error.message)

    const { error: rpcErr } = await supabase.rpc('recompute_marketplace_price_usd').single()
    if (rpcErr && !rpcErr.message.includes('function')) console.warn('fx recompute:', rpcErr.message)

    return jsonResponse({
      success: true,
      items: rows.length,
      items_processed: rows.length,
      items_succeeded: rows.length,
    }, 200, req)
  } catch (error) {
    return errorResponse((error as Error).message, 500, req)
  }
})
