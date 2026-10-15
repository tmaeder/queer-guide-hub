import { getDomain } from 'tldts';
import { redirectHostname } from './redirect-domains.ts';
import { DOMAIN_CONNECT_PROVIDER, DOMAIN_CONNECT_SERVICE } from './redirect-domain-connect.ts';

type Provider = 'cloudflare' | 'vercel';
export type DomainConnectDiscovery =
  | { status: 'available'; provider: Provider; hostname: string; domain: string; host: string; apiBase: string; syncBase: string; templateVersion: number | null }
  | { status: 'unsupported' | 'unavailable'; reason: 'no_zone' | 'apex_not_supported' | 'dns_provider_not_supported' | 'template_not_supported' | 'provider_unavailable' };
const DNS = 'https://cloudflare-dns.com/dns-query';
const templatePath = '/v2/domainTemplates/providers/' + DOMAIN_CONNECT_PROVIDER + '/services/' + DOMAIN_CONNECT_SERVICE;

function endpoint(value: unknown, purpose: 'settings' | 'api' | 'sync', provider?: Provider): URL | null {
  if (typeof value !== 'string' || value.length > 1024 || /[\s\\@?#%]/.test(value)) return null;
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || url.port || url.username || url.password || !/^\/(?:[a-zA-Z0-9_-]+\/?)*$/.test(url.pathname)) return null;
  const family = url.hostname === 'cloudflare.com' || url.hostname.endsWith('.cloudflare.com') ? 'cloudflare' : url.hostname === 'vercel.com' || url.hostname.endsWith('.vercel.com') ? 'vercel' : null;
  if (!family || provider && provider !== family) return null;
  if (purpose === 'sync' && (family === 'cloudflare' ? url.origin !== 'https://dash.cloudflare.com' : url.origin !== 'https://vercel.com')) return null;
  if (family === 'cloudflare' && purpose !== 'sync' && (url.origin !== 'https://api.cloudflare.com' || url.pathname.replace(/\/$/, '') !== '/client/v4/dns/domainconnect')) return null;
  url.pathname = url.pathname.replace(/\/$/, '') || '/';
  return url;
}
function base(url: URL) { return url.href.replace(/\/$/, ''); }
async function body(response: Response, max: number) {
  if (!response.body) return '';
  const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0, text = '', done = false;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) { done = true; break; }
      bytes += part.value.byteLength;
      if (bytes > max) throw new Error('Provider response exceeds limit');
      text += decoder.decode(part.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    if (!done) { try { await reader.cancel(); } catch { /* Fetch abort can close the reader first. */ } }
    reader.releaseLock();
  }
}
async function dns(name: string, type: 2 | 16, fetcher: typeof fetch, signal: AbortSignal) {
  const url = new URL(DNS); url.searchParams.set('name', name); url.searchParams.set('type', String(type));
  const response = await fetcher(url, { headers: { Accept: 'application/dns-json' }, redirect: 'error', cache: 'no-store', signal });
  if (!response.ok || !response.headers.get('Content-Type')?.toLowerCase().includes('application/dns-json')) { await response.body?.cancel(); throw new Error('DNS unavailable'); }
  const data = JSON.parse(await body(response, 16384));
  if (!data || data.TC === true || ![0,3].includes(data.Status) || !Array.isArray(data.Question) || data.Question.length !== 1 || data.Question[0]?.type !== type || String(data.Question[0]?.name).toLowerCase().replace(/\.$/, '') !== name || data.Answer !== undefined && (!Array.isArray(data.Answer) || data.Answer.length > 100)) throw new Error('Invalid DNS response');
  return data.Status === 3 ? [] : data.Answer ?? [];
}
function txtValue(answers: { name?: string; type?: number; data?: string }[], name: string): string | null {
  const seen = new Set<string>();
  let current = name;
  for (let depth = 0; depth < 8; depth++) {
    if (seen.has(current)) throw new Error('DNS alias loop'); seen.add(current);
    const records = answers.filter(row => String(row.name).toLowerCase().replace(/\.$/, '') === current);
    const aliases = records.filter(row => row.type === 5);
    if (aliases.length > 1) throw new Error('Ambiguous DNS alias');
    if (aliases.length) {
      if (records.some(row => row.type === 16)) throw new Error('Ambiguous DNS TXT');
      const next = aliases[0].data;
      if (typeof next !== 'string' || next.length > 254 || !/^(?:[a-z0-9_-]+\.)+[a-z0-9-]+\.?$/i.test(next)) throw new Error('Invalid DNS alias');
      current = next.toLowerCase().replace(/\.$/, ''); continue;
    }
    const values = records.filter(row => row.type === 16).map(row => {
      if (typeof row.data !== 'string' || row.data.length > 2048) throw new Error('Invalid DNS TXT');
      const chunks = row.data.match(/"[^"\\]*"/g);
      if (!chunks || chunks.join(' ') !== row.data.trim()) throw new Error('Invalid DNS TXT');
      return chunks.map(chunk => chunk.slice(1,-1)).join('');
    });
    if (values.length > 1) throw new Error('Ambiguous DNS provider');
    return values[0] ?? null;
  }
  throw new Error('DNS alias limit');
}
async function settings(url: URL, fetcher: typeof fetch, signal: AbortSignal) {
  const response = await fetcher(url, { headers: { Accept: 'application/json' }, redirect: 'error', cache: 'no-store', signal });
  if (response.status === 404) { await response.body?.cancel(); return null; }
  if (!response.ok || !response.headers.get('Content-Type')?.toLowerCase().includes('application/json')) { await response.body?.cancel(); throw new Error('Provider unavailable'); }
  const data = JSON.parse(await body(response, 32768));
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid provider settings');
  return data;
}

/** Read-only discovery. Call only after reserving an authenticated owner operation and network budget. */
export async function discoverDomainConnect(hostnameInput: string, options: { fetcher?: typeof fetch; signal?: AbortSignal } = {}): Promise<DomainConnectDiscovery> {
  const hostname = redirectHostname(hostnameInput);
  const registered = getDomain(hostname, { allowPrivateDomains: true, validateHostname: true });
  if (!registered) return { status: 'unsupported', reason: 'no_zone' };
  const fetcher = options.fetcher ?? fetch;
  // One deadline covers the entire ancestry/discovery sequence, including response bodies.
  const deadline = AbortSignal.timeout(8000), signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline;
  try {
    let zone = hostname;
    for (;;) {
      const records = await dns(zone, 2, fetcher, signal);
      if (records.some((row: { name?: string; type?: number; data?: string }) => row.type === 2 && String(row.name).toLowerCase().replace(/\.$/, '') === zone && typeof row.data === 'string' && /^(?:[a-z0-9_-]+\.)+[a-z0-9-]+\.?$/i.test(row.data))) break;
      if (zone === registered) return { status: 'unsupported', reason: 'no_zone' };
      zone = zone.slice(zone.indexOf('.') + 1);
    }
    if (zone === hostname) return { status: 'unsupported', reason: 'apex_not_supported' };
    const name = '_domainconnect.' + zone, value = txtValue(await dns(name, 16, fetcher, signal), name);
    if (!value) return { status: 'unsupported', reason: 'dns_provider_not_supported' };
    const prefix = endpoint('https://' + value, 'settings');
    if (!prefix) return { status: 'unsupported', reason: 'dns_provider_not_supported' };
    const metadata = await settings(new URL(base(prefix) + '/v2/' + encodeURIComponent(zone) + '/settings'), fetcher, signal);
    if (!metadata) return { status: 'unavailable', reason: 'provider_unavailable' };
    const provider = metadata.providerId === 'cloudflare.com' ? 'cloudflare' : metadata.providerId === 'vercel.com' ? 'vercel' : null;
    const api = provider && endpoint(metadata.urlAPI, 'api', provider), sync = provider && endpoint(metadata.urlSyncUX, 'sync', provider);
    if (!provider || !endpoint(base(prefix), 'settings', provider) || !api || !sync) return { status: 'unsupported', reason: 'dns_provider_not_supported' };
    const response = await fetcher(base(api) + templatePath, { headers: { Accept: 'application/json' }, redirect: 'error', cache: 'no-store', signal });
    if (response.status === 404) { await response.body?.cancel(); return { status: 'unsupported', reason: 'template_not_supported' }; }
    if (response.status !== 200) { await response.body?.cancel(); throw new Error('Template unavailable'); }
    const content = await body(response, 32768);
    const template = content.trim() ? JSON.parse(content) : null;
    if (content.trim() && (!template || typeof template !== 'object' || Array.isArray(template) || template.success === false || 'error' in template || 'errors' in template)) throw new Error('Invalid template response');
    const version = template?.version ?? null;
    if (version !== null && version !== undefined && version !== 1) return { status: 'unsupported', reason: 'template_not_supported' };
    return { status: 'available', provider, hostname, domain: zone, host: hostname.slice(0,-zone.length-1), apiBase: base(api), syncBase: base(sync), templateVersion: version ?? null };
  } catch { return { status: 'unavailable', reason: 'provider_unavailable' }; }
}
