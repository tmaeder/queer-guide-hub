import type { SupabaseClient } from '@supabase/supabase-js';
import { UUID } from './redirect-api.ts';
import { checkRedirectDomainDns } from './redirect-domains.ts';
import { discoverDomainConnect } from './redirect-domain-discovery.ts';
import { DOMAIN_CONNECT_TARGET, DOMAIN_CONNECT_PROVIDER, DOMAIN_CONNECT_SERVICE, signDomainConnectQuery } from './redirect-domain-connect.ts';

export interface DomainConnectConfig { privateKey: CryptoKey; keyLabel: string; fingerprint: string }
/** Server-only configuration; never serialize the private key or environment input. */
export async function domainConnectConfig(jwkInput: string, keyLabel: string, target: string): Promise<DomainConnectConfig | null> {
  if (target.trim().toLowerCase().replace(/\.$/, '') !== DOMAIN_CONNECT_TARGET || !/^_[a-z0-9](?:[a-z0-9-]{0,60}[a-z0-9])?$/.test(keyLabel) || jwkInput.length > 16384) return null;
  try {
    const jwk = JSON.parse(jwkInput);
    if (!jwk || typeof jwk !== 'object' || Array.isArray(jwk) || jwk.kty !== 'RSA' ||
      ['n','e','d','p','q','dp','dq','qi'].some(field => typeof jwk[field] !== 'string' || !/^[A-Za-z0-9_-]+$/.test(jwk[field])) ||
      jwk.alg && jwk.alg !== 'RS256' || jwk.use && jwk.use !== 'sig') return null;
    const privateKey = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const algorithm = privateKey.algorithm as RsaHashedKeyAlgorithm;
    if (algorithm.modulusLength < 2048 || algorithm.modulusLength > 8192) return null;
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ n: jwk.n, e: jwk.e, keyLabel, target: DOMAIN_CONNECT_TARGET })));
    const fingerprint = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
    return { privateKey, keyLabel, fingerprint };
  } catch { return null; }
}
export function domainConnectInput(value: unknown, action: 'discover' | 'approve' | 'complete'): { version: string; operation?: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Provide current DNS setup fields');
  const input = value as Record<string, unknown>, fields = action === 'discover' ? ['version'] : ['version','operation'];
  if (Object.keys(input).some(field => !fields.includes(field)) || typeof input.version !== 'string' || !UUID.test(input.version) || action !== 'discover' && (typeof input.operation !== 'string' || !UUID.test(input.operation))) throw new Error('Reload the domain before continuing DNS setup');
  return input as { version: string; operation?: string };
}

export async function runDomainConnectAction(db: SupabaseClient, actor: string, domain: string, action: 'discover' | 'approve' | 'complete', input: { version: string; operation?: string }, config: DomainConnectConfig) {
  const rpc = (step: string, operation: string | null = input.operation ?? null, values: Record<string, unknown> = {}) => db.rpc('redirect_domain_connect_operation', {
    p_action: step, p_actor: actor, p_domain: domain, p_version: input.version, p_configuration: config.fingerprint, p_operation: operation, p_values: values,
  });
  const reserved = await rpc(action === 'discover' ? 'reserve' : action === 'approve' ? 'sign' : 'check');
  if (reserved.error || reserved.data?.retryAfter) return reserved;
  const operation = reserved.data;
  if (action === 'discover') {
    const discovery = await discoverDomainConnect(operation.domain.hostname);
    return await rpc('discovered', operation.id, discovery);
  }
  if (action === 'approve') {
    const query = await signDomainConnectQuery({ rootDomain: operation.discovery.domain, hostname: operation.domain.hostname, verificationToken: operation.domain.verification.value.slice('qg-redirect='.length), operationId: operation.id, keyLabel: config.keyLabel }, config.privateKey);
    // Recheck current role, domain/challenge version, key configuration and lease after signing.
    const issued = await rpc('issued');
    if (issued.error) return issued;
    const url = new URL(operation.discovery.syncBase + '/v2/domainTemplates/providers/' + DOMAIN_CONNECT_PROVIDER + '/services/' + DOMAIN_CONNECT_SERVICE + '/apply');
    url.search = query.query;
    return { data: { id: operation.id, state: 'approved', expiresAt: operation.expiresAt, approvalUrl: url.href, domain: issued.data.domain }, error: null };
  }
  const outcome = await checkRedirectDomainDns(operation.domain.verification);
  return await rpc('checked', operation.id, { outcome });
}
