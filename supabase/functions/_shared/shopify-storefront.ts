import { assertPublicHttpUrl } from './ssrf-guard.ts'
const UA = 'QueerGuideBot/1.0 (+https://queer.guide/bot)'

const STOREFRONT_API_VERSION = '2026-10'
const STOREFRONT_PER_PAGE = 50 // tokenless complexity limit is 1,000

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

