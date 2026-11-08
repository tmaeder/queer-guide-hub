// MX-record validation for crawl-extracted emails. DNS-only (no fetch): an
// email is worth storing only when its domain publishes MX records.
// Deno.resolveDns has no timeout option, so the lookup races a short timer;
// any failure (NXDOMAIN, timeout, refused) counts as "no MX".

const DNS_TIMEOUT_MS = 4_000

export async function hasMxRecords(domain: string): Promise<boolean> {
  const d = (domain ?? '').trim().toLowerCase().replace(/\.$/, '')
  if (!d || !d.includes('.')) return false
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const records = await Promise.race([
      Deno.resolveDns(d, 'MX'),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('dns timeout')), DNS_TIMEOUT_MS)
      }),
    ])
    return Array.isArray(records) && records.length > 0
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

