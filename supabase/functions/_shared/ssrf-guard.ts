// SSRF guard for server-side fetches of caller-supplied URLs.
// Blocks non-http(s) schemes and hostnames that target the loopback,
// private, link-local, or cloud-metadata ranges. Literal-IP based — it does
// not resolve DNS, so it stops the direct-literal vector (the common case for
// these endpoints); hostnames that resolve to private IPs (DNS rebinding) are
// out of scope and would need a resolving proxy to fully defend.

function ipv4ToParts(host: string): number[] | null {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return null
  const parts = m.slice(1).map(Number)
  if (parts.some((n) => n > 255)) return null
  return parts
}

function isPrivateIpv4([a, b]: number[]): boolean {
  if (a === 10) return true
  if (a === 127) return true // loopback
  if (a === 0) return true
  if (a === 169 && b === 254) return true // link-local + metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  return false
}

export function assertPublicHttpUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('Invalid URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Blocked URL scheme: ${url.protocol}`)
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    throw new Error('Blocked URL host (local)')
  }
  // IPv6 loopback / unique-local / link-local
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) {
    throw new Error('Blocked URL host (ipv6 private)')
  }
  const v4 = ipv4ToParts(host)
  if (v4 && isPrivateIpv4(v4)) {
    throw new Error('Blocked URL host (private range)')
  }
  return url
}
