import { UUID } from './redirect-api.ts';
import { validPublicTarget } from './link-policy.ts';

export function redirectHostname(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || /[\s/:@?#%\\]/.test(value))
    throw new Error('Enter a hostname without a scheme, port or path');
  let hostname: string;
  try {
    hostname = new URL('https://' + value.trim().replace(/\.$/, '')).hostname.toLowerCase();
  } catch {
    throw new Error('Enter a valid public hostname');
  }
  if (
    hostname.length > 239 ||
    !/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/.test(hostname) ||
    /(?:^|\.)(?:queer\.guide|supabase\.co|workers\.dev|pages\.dev|cloudflare\.com|localhost|local|internal|home|test|invalid|example|onion)$/.test(
      hostname,
    )
  )
    throw new Error('Choose a public domain you control, outside Queer Guide infrastructure');
  return hostname;
}
export function domainInput(
  value: unknown,
  action: 'create' | 'patch' | 'version',
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Provide domain settings');
  const body = value as Record<string, unknown>;
  const fields =
    action === 'version'
      ? ['version']
      : action === 'create'
        ? ['hostname', 'rootUrl', 'notFoundUrl', 'expiredUrl', 'disabled']
        : ['version', 'rootUrl', 'notFoundUrl', 'expiredUrl', 'disabled', 'archived'];
  if (!Object.keys(body).length || Object.keys(body).some((key) => !fields.includes(key)))
    throw new Error('Invalid domain fields');
  if (action !== 'create' && (typeof body.version !== 'string' || !UUID.test(body.version)))
    throw new Error('Reload the domain before continuing');
  const output: Record<string, unknown> = { ...body };
  if (action === 'create') output.hostname = redirectHostname(body.hostname);
  if ('archived' in body && typeof body.archived !== 'boolean')
    throw new Error('Invalid archive state');
  if (body.disabled !== undefined && typeof body.disabled !== 'boolean')
    throw new Error('Invalid domain state');
  for (const key of ['rootUrl', 'notFoundUrl', 'expiredUrl'])
    if (key in body) {
      if (body[key] === null) {
        output[key] = null;
        continue;
      }
      if (
        typeof body[key] !== 'string' ||
        !/^https?:\/\//i.test(body[key] as string) ||
        !validPublicTarget(body[key] as string)
      )
        throw new Error('Choose public HTTP(S) destinations');
      const url = new URL(body[key] as string);
      if (
        url.hostname === output.hostname ||
        (['queer.guide', 'www.queer.guide'].includes(url.hostname) &&
          url.pathname.startsWith('/go/'))
      )
        throw new Error('Domain defaults cannot point to a short-link domain');
      output[key] = url.href;
    }
  return output;
}
export type DomainProof = { name: string; value: string };
export type DomainDnsOutcome = 'verified' | 'missing' | 'unavailable';
/** DNS-only verification: never fetch the user-supplied hostname or follow redirects. */
export async function checkRedirectDomainDns(
  proof: DomainProof,
  fetcher: typeof fetch = fetch,
): Promise<DomainDnsOutcome> {
  if (
    !/^_qg-redirect\.([a-z0-9-]+\.)+[a-z0-9-]+$/.test(proof.name) ||
    proof.name.length > 253 ||
    !/^qg-redirect=[a-f0-9]{64}$/.test(proof.value)
  )
    return 'unavailable';
  const url = new URL('https://cloudflare-dns.com/dns-query');
  url.searchParams.set('name', proof.name);
  url.searchParams.set('type', 'TXT');
  try {
    const response = await fetcher(url, {
      headers: { Accept: 'application/dns-json' },
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
    if (
      !response.ok ||
      !response.headers.get('Content-Type')?.toLowerCase().includes('application/dns-json') ||
      !response.body
    )
      return 'unavailable';
    const reader = response.body.getReader();
    let text = '',
      size = 0;
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 65536) {
        await reader.cancel();
        return 'unavailable';
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const data = JSON.parse(text);
    if (data.TC === true || (data.Status !== 0 && data.Status !== 3)) return 'unavailable';
    if (
      !Array.isArray(data.Question) ||
      data.Question.length !== 1 ||
      data.Question[0]?.type !== 16 ||
      String(data.Question[0]?.name).toLowerCase().replace(/\.$/, '') !== proof.name
    )
      return 'unavailable';
    if (data.Status === 3) return 'missing';
    if (data.Answer === undefined) return 'missing';
    if (!Array.isArray(data.Answer) || data.Answer.length > 100) return 'unavailable';
    for (const answer of data.Answer) {
      if (
        answer.type !== 16 ||
        String(answer.name).toLowerCase().replace(/\.$/, '') !== proof.name ||
        typeof answer.data !== 'string' ||
        answer.data.length > 4096
      )
        continue;
      // TXT RDATA can contain several quoted character strings. Our ASCII token
      // needs no DNS escapes, so reject all escapes instead of guessing at them.
      const chunks = answer.data.match(/"[^"\\]*"/g);
      if (
        chunks &&
        chunks.join(' ').replace(/\s/g, '') === answer.data.replace(/\s/g, '') &&
        chunks.map((chunk: string) => chunk.slice(1, -1)).join('') === proof.value
      )
        return 'verified';
    }
    return 'missing';
  } catch {
    return 'unavailable';
  }
}
