/** MAC namespace intentionally differs from visitor-IP and public-report relays. */
const DOMAIN_ROUTING_PROTOCOL = 1;
export const DOMAIN_HEALTH_PATH = '/.well-known/qg-redirect';
export interface DomainRelay {
  hostname: string;
  path: string;
  query: string;
  ip: string;
  timestamp: string;
  signature: string;
}
const domainEncoder = new TextEncoder();
async function domainKey(secret: string) {
  return crypto.subtle.importKey('raw', domainEncoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
function domainPayload(method: string, relay: Omit<DomainRelay, 'signature'>) {
  return JSON.stringify(['qg-domain-route', DOMAIN_ROUTING_PROTOCOL, method, relay.hostname, relay.path, relay.query, relay.ip, relay.timestamp]);
}
function domainRelayValid(method: string, relay: Omit<DomainRelay, 'signature'>) {
  return ['GET', 'HEAD', 'POST'].includes(method) && relay.hostname.length <= 239 &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(relay.hostname) &&
    !['queer.guide', 'www.queer.guide'].includes(relay.hostname) &&
    relay.path.startsWith('/') && relay.path.length <= 2048 && !/[\r\n?#]/.test(relay.path) &&
    relay.query.length <= 8192 && new URLSearchParams(relay.query).toString() === relay.query &&
    relay.ip.length > 0 && relay.ip.length <= 64 && !/[\r\n]/.test(relay.ip) && /^\d{10}$/.test(relay.timestamp);
}
export function domainLinkSlug(path: string) {
  return /^\/[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(path) ? path.slice(1) : '';
}
export async function signDomainRelay(method: string, url: URL, ip: string, secret: string, now = Date.now()): Promise<DomainRelay | null> {
  const relay = { hostname: url.hostname, path: url.pathname, query: url.searchParams.toString(), ip, timestamp: String(Math.floor(now / 1000)) };
  if (secret.length < 32 || url.protocol !== 'https:' || url.port || !domainRelayValid(method, relay)) return null;
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', await domainKey(secret), domainEncoder.encode(domainPayload(method, relay))));
  return { ...relay, signature: Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('') };
}
export function domainRelayHeaders(relay: DomainRelay) {
  return Object.fromEntries(Object.entries(relay).map(([key, value]) => ['x-qg-domain-' + key, value]));
}
export function hasDomainRelay(headers: Headers) {
  return Array.from(headers.keys()).some(key => key.startsWith('x-qg-domain-'));
}
export async function verifyDomainRelay(request: Request, secret?: string, now = Date.now()): Promise<DomainRelay | null> {
  if (!secret || secret.length < 32) return null;
  const read = (key: string) => request.headers.get('x-qg-domain-' + key) ?? '';
  const relay: DomainRelay = { hostname: read('hostname'), path: read('path'), query: read('query'), ip: read('ip'), timestamp: read('timestamp'), signature: read('signature') };
  if (!domainRelayValid(request.method, relay) || !/^[0-9a-f]{64}$/.test(relay.signature) || Math.abs(now / 1000 - Number(relay.timestamp)) > 120) return null;
  const upstream = new URL(request.url);
  // Reject duplicate routing fields as well as an altered upstream query/slug.
  if (Array.from(upstream.searchParams.keys()).some(key=>!['slug','q'].includes(key))) return null;
  if (upstream.searchParams.getAll('slug').length !== 1 || upstream.searchParams.get('slug') !== domainLinkSlug(relay.path) || upstream.searchParams.getAll('q').length > 1 || (upstream.searchParams.get('q') ?? '') !== relay.query) return null;
  const bytes = Uint8Array.from(relay.signature.match(/../g)!, pair => parseInt(pair, 16));
  return await crypto.subtle.verify('HMAC', await domainKey(secret), bytes, domainEncoder.encode(domainPayload(request.method, relay))) ? relay : null;
}
