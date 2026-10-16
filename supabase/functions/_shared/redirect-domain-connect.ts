import { UUID } from './redirect-api.ts';
import { redirectHostname } from './redirect-domains.ts';

export const DOMAIN_CONNECT_PROVIDER = 'queer.guide';
export const DOMAIN_CONNECT_SERVICE = 'redirects';
export const DOMAIN_CONNECT_TARGET = 'links.queer.guide';
export const DOMAIN_CONNECT_KEY_DOMAIN = 'domainconnect.queer.guide';
export interface DomainConnectRequest {
  rootDomain: string;
  hostname: string;
  verificationToken: string;
  operationId: string;
  keyLabel: string;
}
/** Pure signing boundary. The owner authorization, provider discovery and operation lease belong to its caller. */
export async function signDomainConnectQuery(request: DomainConnectRequest, privateKey: CryptoKey) {
  if (!request || typeof request !== 'object' || Array.isArray(request) ||
      Object.keys(request).some(field => !['rootDomain', 'hostname', 'verificationToken', 'operationId', 'keyLabel'].includes(field)))
    throw new Error('Provide only DNS setup signing fields.');
  const domain = redirectHostname(request.rootDomain);
  const hostname = redirectHostname(request.hostname);
  if (!hostname.endsWith('.' + domain))
    throw new Error('Choose a subdomain of the discovered DNS zone; apex setup requires a separate approved template.');
  if (typeof request.verificationToken !== 'string' || !/^[a-f0-9]{64}$/.test(request.verificationToken))
    throw new Error('Refresh the domain ownership challenge.');
  if (typeof request.operationId !== 'string' || !UUID.test(request.operationId))
    throw new Error('A current DNS setup operation is required.');
  if (typeof request.keyLabel !== 'string' || !/^_[a-z0-9](?:[a-z0-9-]{0,60}[a-z0-9])?$/.test(request.keyLabel))
    throw new Error('Configure a single public-key DNS label.');
  const algorithm = privateKey?.algorithm as RsaHashedKeyAlgorithm | undefined;
  if (privateKey?.type !== 'private' || !privateKey.usages.includes('sign') ||
      algorithm?.name !== 'RSASSA-PKCS1-v1_5' || algorithm.hash?.name !== 'SHA-256' ||
      algorithm.modulusLength < 2048 || algorithm.modulusLength > 8192)
    throw new Error('Configure an RS256 signing key of at least 2048 bits.');
  const host = hostname.slice(0, -domain.length - 1);
  const callback = new URL('https://queer.guide/admin/content/redirects');
  // Cloudflare ignores state. Correlation is part of the signed, fixed-origin redirect URI.
  callback.searchParams.set('domain_connect', request.operationId);
  const unsigned = new URLSearchParams({ domain, host, verification: request.verificationToken, redirect_uri: callback.href }).toString();
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(unsigned));
  const encoded = btoa(String.fromCharCode(...new Uint8Array(signature)));
  // Domain Connect excludes key and sig from signing; Cloudflare requires sig last.
  return { hostname, domain, host, callback: callback.href,
    query: unsigned + '&key=' + encodeURIComponent(request.keyLabel) + '&sig=' + encodeURIComponent(encoded) };
}
