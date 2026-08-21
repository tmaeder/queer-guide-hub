/**
 * SSRF guard — block fetches to private / loopback / link-local / cloud-metadata
 * hosts. Shared across every worker that fetches an arbitrary caller- or
 * merchant-supplied URL (extract, submit's render/watch/sitemap). Previously each
 * of those kept its own inline copy (workers/extract/src/ssrf.ts,
 * workers/submit/src/sitemap.ts) and workers/submit/src/render.ts + watch.ts had
 * none at all — three divergent/missing guards on the same class of endpoint.
 *
 * Literal-IP based — does not resolve DNS, so it stops the direct-literal vector
 * (the common case for these endpoints); a hostname that only resolves to a
 * private IP at request time (DNS rebinding) is out of scope and would need a
 * resolving proxy to fully defend.
 */

const UNSAFE_HOST_SUFFIX_PATTERNS = [
  /^localhost$/i,
  /\.(local|internal|localhost)$/i,
];

type Ipv4Parts = [number, number, number, number];

function ipv4ToParts(host: string): Ipv4Parts | null {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts: Ipv4Parts = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  if (parts.some((n) => n > 255)) return null;
  return parts;
}

function isPrivateIpv4([a, b]: Ipv4Parts): boolean {
  if (a === 10) return true;
  if (a === 127) return true; // loopback
  if (a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local + metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

// IPv4-mapped/-translated IPv6 literals (::ffff:a9fe:a9fe / ::ffff:169.254.169.254)
// embed a real IPv4 address in the low 32 bits. The WHATWG URL parser normalizes
// bracketed literals to the compressed hex-group form (verified: both dotted-quad
// and hex-group input collapse to e.g. "::ffff:a9fe:a9fe"), so that's the shape
// that actually reaches this function — the dotted match below is kept for a
// caller passing an already-normalized string directly. Without this,
// 169.254.169.254 (cloud metadata) and 127.0.0.1 are reachable via their
// IPv4-mapped-IPv6 spelling even though the dotted-quad form is blocked above.
function ipv4FromMappedIpv6(host: string): Ipv4Parts | null {
  const hexMatch = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (hexMatch) {
    const hi = parseInt(hexMatch[1]!, 16);
    const lo = parseInt(hexMatch[2]!, 16);
    return [(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff];
  }
  const dottedMatch = host.match(/^::ffff:(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/i);
  if (dottedMatch) {
    const parts: Ipv4Parts = [Number(dottedMatch[1]), Number(dottedMatch[2]), Number(dottedMatch[3]), Number(dottedMatch[4])];
    if (parts.some((n) => n > 255)) return null;
    return parts;
  }
  return null;
}

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

/** Returns a normalized URL or throws UnsafeUrlError. */
export function assertPublicHttpUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new UnsafeUrlError(`invalid url: ${raw}`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new UnsafeUrlError(`blocked protocol: ${u.protocol}`);
  }
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (UNSAFE_HOST_SUFFIX_PATTERNS.some((re) => re.test(host))) {
    throw new UnsafeUrlError(`blocked host: ${u.hostname}`);
  }
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) {
    throw new UnsafeUrlError(`blocked host: ${u.hostname}`);
  }
  const v4 = ipv4ToParts(host);
  if (v4 && isPrivateIpv4(v4)) {
    throw new UnsafeUrlError(`blocked host: ${u.hostname}`);
  }
  const mappedV4 = ipv4FromMappedIpv6(host);
  if (mappedV4 && isPrivateIpv4(mappedV4)) {
    throw new UnsafeUrlError(`blocked host (ipv4-mapped ipv6): ${u.hostname}`);
  }
  return u;
}
