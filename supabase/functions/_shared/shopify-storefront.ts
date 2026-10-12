import { assertPublicHttpUrl } from './ssrf-guard.ts'
const UA = 'QueerGuideBot/1.0 (+https://queer.guide/bot)'

const STOREFRONT_API_VERSION = '2026-10'
const STOREFRONT_PER_PAGE = 50 // tokenless complexity limit is 1,000

/** The storefront theme publishes this read-only token to every visitor. */
export function publicThemeToken(html: string): string | null {
  const script = html.match(/<script\b[^>]*\bid=["']shopify-features["'][^>]*>([\s\S]*?)<\/script>/i)
  if (!script) return null
  try {
    const token = JSON.parse(script[1]).accessToken
    return typeof token === 'string' && /^[a-z0-9_-]{16,256}$/i.test(token) ? token : null
  } catch { return null }
}

export async function publicStorefrontCredentials(shopDomain: string): Promise<{ token: string; domain: string } | null> {
  let url = assertPublicHttpUrl(`https://${shopDomain}/`)
  const signal = AbortSignal.timeout(10000)
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetch(url, { redirect: 'manual', signal, headers: { 'User-Agent': UA } })
    if ([301,302,303,307,308].includes(response.status)) {
      const location = response.headers.get('location')
      await response.body?.cancel()
      if (!location || redirects === 3) return null
      url = assertPublicHttpUrl(new URL(location, url).toString())
      continue
    }
    if (!response.ok || Number(response.headers.get('content-length') ?? 0) > 5000000) {
      await response.body?.cancel()
      return null
    }
    const html = await response.text()
    if (html.length > 5000000) return null
    const token = publicThemeToken(html)
    return token ? { token, domain: url.hostname } : null
  }
  return null
}

// `country` is passed as a $variable rather than interpolated into the query string:
// it originates from merchant config, and a directive built by concatenation would be
// an injection point into the GraphQL document.
const STOREFRONT_QUERY = `query($n:Int!,$c:String,$country:CountryCode!) @inContext(country: $country) {
  products(first:$n, after:$c) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id title handle description vendor productType tags onlineStoreUrl
      images(first:5){ nodes{ url } }
      variants(first:1){ nodes{ sku availableForSale price{ amount currencyCode } } }
    }
  }
}`

export interface StorefrontProduct {
  id: string; title: string; handle: string; description: string
  vendor: string; productType: string; tags: string[]; onlineStoreUrl: string | null
  images: { nodes: { url: string }[] }
  variants: { nodes: { sku: string | null; availableForSale: boolean; price: { amount: string; currencyCode: string } }[] }
}

export async function storefrontPage(
  shopDomain: string, token: string | null, country: string, cursor: string | null,
): Promise<{ nodes: StorefrontProduct[]; hasNext: boolean; endCursor: string | null }> {
  let url = assertPublicHttpUrl(`https://${shopDomain}/api/${STOREFRONT_API_VERSION}/graphql.json`)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 25_000)
  try {
    const init: RequestInit = {
      method: 'POST', redirect: 'manual', signal: ctrl.signal,
      headers: {
        ...(token ? { 'X-Shopify-Storefront-Access-Token': token } : {}),
        'content-type': 'application/json',
        'User-Agent': UA,
      },
      body: JSON.stringify({
        // Product tags require a token; the rest is public catalog data.
        query: token ? STOREFRONT_QUERY : STOREFRONT_QUERY.replace('productType tags onlineStoreUrl', 'productType onlineStoreUrl'),
        variables: { n: STOREFRONT_PER_PAGE, c: cursor, country },
      }),
    }
    let res = await fetch(url, init)
    for (let redirects = 0; [301, 302, 303, 307, 308].includes(res.status); redirects++) {
      const location = res.headers.get('location')
      if (!location || redirects >= 3) throw new Error('storefront redirect limit or missing destination')
      const next = assertPublicHttpUrl(new URL(location, url).toString())
      if (token && next.hostname !== url.hostname) throw new Error('storefront token redirect: configure storefront_domain explicitly')
      await res.body?.cancel()
      url = next
      // Ordinary fetch changes a POST into GET on 301/302, dropping the query.
      res = await fetch(url, init)
    }
    if (!res.ok) throw new Error(`storefront ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const json = await res.json() as { data?: { products?: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: StorefrontProduct[] } }; errors?: unknown[] }
    if (json.errors?.length) throw new Error(`storefront graphql: ${JSON.stringify(json.errors).slice(0, 250)}`)
    const p = json.data?.products
    if (!p) throw new Error('storefront: no products in response')
    return { nodes: p.nodes ?? [], hasNext: p.pageInfo.hasNextPage, endCursor: p.pageInfo.endCursor }
  } finally { clearTimeout(timer) }
}
