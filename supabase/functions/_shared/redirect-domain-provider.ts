import type { SupabaseClient } from '@supabase/supabase-js';
import { checkRedirectDomainDns } from './redirect-domains.ts';
import { UUID } from './redirect-api.ts';
export interface DomainProviderConfig {
  zoneId: string;
  token: string;
  cnameTarget: string;
}
export function domainProviderConfig(
  zone: string,
  token: string,
  target: string,
): DomainProviderConfig | null {
  if (
    !/^[a-f0-9]{32}$/.test(zone) ||
    !token ||
    token.length > 4096 ||
    /\s/.test(token) ||
    target.length > 239 ||
    !/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/.test(target) ||
    /(?:^|\.)(?:localhost|local|internal|home|test|invalid|example|onion)$/.test(target)
  )
    return null;
  return { zoneId: zone, token, cnameTarget: target };
}
export function domainProviderInput(value: unknown, action: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Provide provider action fields');
  const body = value as Record<string, unknown>,
    allowed =
      action === 'adopt'
        ? ['version', 'candidateId']
        : action === 'confirm-absence'
          ? ['version', 'confirmedAbsent']
          : ['version'];
  if (
    Object.keys(body).some((key) => !allowed.includes(key)) ||
    typeof body.version !== 'string' ||
    !UUID.test(body.version)
  )
    throw new Error('Refresh the domain before continuing');
  if (action === 'adopt' && (typeof body.candidateId !== 'string' || !UUID.test(body.candidateId)))
    throw new Error('Choose a reviewed provider candidate');
  if (action === 'confirm-absence' && body.confirmedAbsent !== true)
    throw new Error('Confirm that you reviewed Cloudflare and the hostname is absent');
  return { version: body.version, candidateId: body.candidateId as string | undefined };
}
// Keep only the awaitable SDK result at this boundary, avoiding nominal
// PostgREST builder types across Edge import providers. Runtime guards below
// validate each operation's actual payload before using it.
export interface DomainProviderDb {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{
    data: Awaited<ReturnType<SupabaseClient['rpc']>>['data'];
    error: { code?: string; message?: string } | null;
  }>;
}
export interface DomainProviderJob {
  id: string;
  operation: string;
  lease: string;
  kind: 'preflight' | 'reconcile' | 'adopt' | 'refresh' | 'delete';
  zoneId: string;
  cnameTarget: string;
  hostname: string;
  providerId: string | null;
  adoptId: string | null;
  desired: boolean;
}
interface ProviderObject {
  id?: string;
  hostname?: string;
  status?: unknown;
  created_at?: unknown;
  ownership_verification?: { name?: unknown; value?: unknown };
  ssl?: { status?: unknown; type?: unknown; method?: unknown; validation_records?: { txt_name?: unknown; txt_value?: unknown }[] };
}
interface ProviderEnvelope {
  success?: boolean;
  result: unknown;
  result_info?: { total_pages?: number };
}
type Snapshot = {
  id: string;
  hostname: string;
  hostnameStatus: string;
  sslStatus: string;
  validation: { type: 'TXT'; name: string; value: string }[];
};
class ProviderFailure extends Error {
  constructor(
    public retry: boolean,
    public ambiguous: boolean,
    public definite: boolean,
    public retryAfter?: number,
    message = 'Cloudflare request unavailable',
  ) {
    super(message);
  }
}
async function boundedProviderJson(response: Response) {
  if (
    !response.body ||
    !response.headers.get('Content-Type')?.toLowerCase().includes('application/json')
  )
    throw new Error('Invalid provider response');
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let size = 0,
    text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 131072) {
      await reader.cancel();
      throw new Error('Provider response too large');
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return JSON.parse(text);
}
function retryAfter(response: Response) {
  const raw = response.headers.get('Retry-After');
  if (!raw) return undefined;
  const seconds = /^\d+$/.test(raw) ? Number(raw) : (Date.parse(raw) - Date.now()) / 1000;
  return Number.isFinite(seconds) ? Math.min(3600, Math.max(10, Math.ceil(seconds))) : undefined;
}
async function providerRequest(
  config: DomainProviderConfig,
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  fetcher: typeof fetch,
  body?: unknown,
): Promise<ProviderEnvelope | null> {
  let response: Response;
  try {
    response = await fetcher(
      'https://api.cloudflare.com/client/v4/zones/' + config.zoneId + '/custom_hostnames' + path,
      {
        method,
        headers: { Authorization: 'Bearer ' + config.token, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
        cache: 'no-store',
      },
    );
  } catch {
    throw new ProviderFailure(true, method === 'POST', false);
  }
  let data: ProviderEnvelope;
  try {
    const raw: unknown = await boundedProviderJson(response);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid provider envelope');
    data = raw as ProviderEnvelope;
  } catch {
    throw new ProviderFailure(true, method === 'POST', false, retryAfter(response));
  }
  if (
    response.status === 404 &&
    data?.success === false &&
    method !== 'POST' &&
    /^\/[a-f0-9-]{36}$/.test(path)
  )
    return null;
  if (!response.ok || data?.success !== true) {
    const definite =
      method === 'POST' &&
      response.status >= 400 &&
      response.status < 500 &&
      ![408, 409].includes(response.status) &&
      data?.success === false;
    throw new ProviderFailure(
      response.status === 429 || response.status === 408 || response.status >= 500,
      method === 'POST' && !definite,
      definite,
      retryAfter(response),
      'Cloudflare returned HTTP ' + response.status,
    );
  }
  return data;
}
function providerSnapshot(input: unknown, hostname: string): Snapshot {
  const value = input as ProviderObject | null;
  if (
    !value ||
    typeof value !== 'object' || Array.isArray(value) ||
    typeof value.id !== 'string' ||
    !UUID.test(value.id) ||
    typeof value.hostname !== 'string' ||
    value.hostname.toLowerCase() !== hostname
  )
    throw new Error('Provider hostname mismatch');
  const status = (raw: unknown) =>
    typeof raw === 'string' && /^[a-z_]{1,64}$/.test(raw) ? raw : 'unknown';
  const validation: Snapshot['validation'] = [];
  const add = (name: unknown, token: unknown) => {
    if (
      typeof name !== 'string' ||
      typeof token !== 'string' ||
      name.length > 253 ||
      token.length < 1 ||
      token.length > 1024 ||
      /[\r\n]/.test(token) ||
      !/^[a-zA-Z0-9_.-]+$/.test(name)
    )
      return;
    const normalized = name.toLowerCase().replace(/\.$/, '');
    if (normalized !== hostname && !normalized.endsWith('.' + hostname)) return;
    if (
      validation.length < 10 &&
      !validation.some((row) => row.name === normalized && row.value === token)
    )
      validation.push({ type: 'TXT', name: normalized, value: token });
  };
  add(value.ownership_verification?.name, value.ownership_verification?.value);
  if (Array.isArray(value.ssl?.validation_records))
    for (const row of value.ssl.validation_records.slice(0, 10)) add(row.txt_name, row.txt_value);
  return {
    id: value.id.toLowerCase(),
    hostname,
    hostnameStatus: status(value.status),
    sslStatus: status(value.ssl?.status),
    validation,
  };
}
async function providerCandidates(
  config: DomainProviderConfig,
  hostname: string,
  fetcher: typeof fetch,
) {
  const data = await providerRequest(
    config,
    '?hostname=' + encodeURIComponent(hostname) + '&per_page=2',
    'GET',
    fetcher,
  );
  if (!data || !Array.isArray(data.result) || data.result.length > 2 || (data.result_info?.total_pages ?? 1) > 1)
    throw new Error('Ambiguous provider search');
  return data.result.map((input: unknown) => {
    const snapshot = providerSnapshot(input, hostname);
    const item = input as ProviderObject;
    return {
      id: snapshot.id,
      hostname,
      ...(typeof item.created_at === 'string' && Number.isFinite(Date.parse(item.created_at))
        ? { createdAt: new Date(item.created_at).toISOString() }
        : {}),
    };
  });
}
export async function dispatchRedirectDomainJobs(
  db: DomainProviderDb,
  config: DomainProviderConfig | null,
  fetcher: typeof fetch = fetch,
) {
  if (!config) return { configured: false, processed: 0, failed: 0, stale: 0 };
  const claimed = await db.rpc('claim_redirect_domain_jobs', { p_limit: 3 });
  if (claimed.error || !Array.isArray(claimed.data) || claimed.data.length > 3)
    throw new Error('Could not claim domain provider work');
  for (const job of claimed.data) {
    if (
      !job ||
      ![job.id, job.operation, job.lease].every(
        (value) => typeof value === 'string' && UUID.test(value),
      ) ||
      !['preflight', 'reconcile', 'adopt', 'refresh', 'delete'].includes(job.kind) ||
      typeof job.hostname !== 'string' ||
      job.hostname.length > 239 ||
      !/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/.test(job.hostname)
    )
      throw new Error('Invalid domain provider claim');
  }
  const counts = { configured: true, processed: 0, failed: 0, stale: 0 };
  for (const job of claimed.data as DomainProviderJob[]) {
    let result: Record<string, unknown> = { kind: 'cancelled' };
    let creating = false;
    try {
      if (job.zoneId !== config.zoneId || job.cnameTarget !== config.cnameTarget)
        throw new ProviderFailure(
          false,
          false,
          false,
          undefined,
          'Provider configuration changed; restore the bound zone and CNAME target',
        );
      if (job.kind === 'refresh') {
        const renewal = await db.rpc('reserve_redirect_domain_renewal', { p_id:job.id,p_lease:job.lease,p_operation:job.operation });
        if (renewal.error) throw new Error('Ownership renewal unavailable');
        if (renewal.data) {
          const proof=renewal.data as { actor:unknown; version:unknown; attempt:unknown; verification?: {name?:unknown;value?:unknown} };
          if (![proof.actor,proof.version,proof.attempt].every(value=>typeof value==='string' && UUID.test(value)) || proof.verification?.name !== '_qg-redirect.'+job.hostname || typeof proof.verification?.value!=='string') throw new Error('Invalid ownership renewal');
          const outcome=await checkRedirectDomainDns({name: proof.verification!.name as string, value: proof.verification!.value as string},fetcher);
          const recorded=await db.rpc('finish_redirect_domain_renewal',{p_id:job.id,p_lease:job.lease,p_operation:job.operation,p_version:proof.version,p_attempt:proof.attempt,p_outcome:outcome});
          if(recorded.error||recorded.data!==true) throw new Error('Ownership changed during renewal');
        }
      }
      if (job.kind === 'preflight' || job.kind === 'reconcile') {
        const candidates = await providerCandidates(config, job.hostname, fetcher);
        if (candidates.length || job.kind === 'reconcile')
          result = { kind: 'candidates', candidates };
        else {
          const started = await db.rpc('begin_redirect_domain_create', {
            p_id: job.id,
            p_lease: job.lease,
            p_operation: job.operation,
          });
          if (started.error) throw new Error('Could not record provider creation intent');
          if (started.data) {
            if (typeof started.data !== 'string' || !UUID.test(started.data))
              throw new Error('Invalid provider creation intent');
            creating = true;
            const created = await providerRequest(config, '', 'POST', fetcher, {
              hostname: job.hostname,
              ssl: { method: 'txt', type: 'dv' },
            });
            const snapshot = providerSnapshot(created?.result, job.hostname);
            const recorded = await db.rpc('record_redirect_domain_provider', {
              p_id: job.id,
              p_nonce: started.data,
              p_provider: snapshot.id,
              p_mode: 'created',
            });
            if (recorded.error) throw new Error('Could not record provider creation receipt');
            result = recorded.data
              ? { kind: 'status', ...snapshot }
              : { kind: 'error', error: 'Provider receipt requires reconciliation', retry: false };
          }
        }
      } else {
        const id = job.kind === 'adopt' ? job.adoptId : job.providerId;
        if (!id || !UUID.test(id))
          throw new ProviderFailure(
            false,
            false,
            false,
            undefined,
            'Invalid provider binding; owner review required',
          );
        const found = await providerRequest(config, '/' + id, 'GET', fetcher);
        if (!found)
          result =
            job.kind === 'adopt' ? { kind: 'candidates', candidates: [] } : { kind: 'deleted', id };
        else {
          const snapshot = providerSnapshot(found.result, job.hostname);
          if (snapshot.id !== id.toLowerCase()) throw new Error('Provider object mismatch');
          if (job.kind === 'delete') {
            const removed = await providerRequest(config, '/' + id, 'DELETE', fetcher);
            if (removed && (typeof (removed.result as ProviderObject | null)?.id !== 'string' || (removed.result as ProviderObject).id!.toLowerCase() !== id.toLowerCase()))
              throw new Error('Invalid provider deletion receipt');
            result = { kind: 'deleted', id };
          } else if (job.kind === 'adopt') {
            const recorded = await db.rpc('record_redirect_domain_provider', {
              p_id: job.id,
              p_nonce: job.lease,
              p_provider: id,
              p_mode: 'adopted',
            });
            if (recorded.error) throw new Error('Could not record provider adoption');
            result = recorded.data ? { kind: 'status', ...snapshot } : { kind: 'cancelled' };
          } else {
            const restarting = await db.rpc('begin_redirect_domain_validation_restart', {
              p_id: job.id, p_lease: job.lease, p_operation: job.operation,
              p_provider: id, p_zone: config.zoneId, p_target: config.cnameTarget,
            });
            if (restarting.error) throw new Error('Validation restart authorization unavailable');
            if (restarting.data === true) {
              const ssl = (found.result as ProviderObject).ssl;
              if (ssl?.type !== 'dv' || typeof ssl?.method !== 'string' || !['txt', 'http', 'email'].includes(ssl.method))
                throw new ProviderFailure(false, false, false, undefined, 'Unsupported certificate settings; inspect Cloudflare before restarting validation');
              try {
                const patched = await providerRequest(config, '/' + id, 'PATCH', fetcher, {
                  ssl: { type: ssl.type, method: ssl.method },
                });
                if (!patched) result = { kind: 'deleted', id };
                else {
                  const updated = providerSnapshot(patched.result, job.hostname);
                  if (updated.id !== id.toLowerCase()) throw new Error('Provider object mismatch');
                  result = { kind: 'status', ...updated };
                }
              } catch {
                // The one-use SQL reservation prevents another PATCH, including after a crash.
                throw new ProviderFailure(true, false, false, undefined,
                  'Validation restart outcome could not be verified; checking status without repeating the request');
              }
            } else result = { kind: 'status', ...snapshot };
          }
        }
      }
    } catch (error) {
      const known = error instanceof ProviderFailure;
      result = {
        kind: 'error',
        error: known
          ? error.message
          : creating
            ? 'Provider creation outcome is uncertain; reconcile before retrying'
            : 'Provider response could not be verified',
        retry: known ? error.retry : !creating,
        definiteRejection: known && error.definite,
        retryAfter: known ? error.retryAfter : undefined,
      };
      counts.failed++;
    }
    const finished = await db.rpc('finish_redirect_domain_job', {
      p_id: job.id,
      p_lease: job.lease,
      p_operation: job.operation,
      p_result: result,
    });
    if (finished.error) throw new Error('Could not acknowledge domain provider work');
    if (!finished.data) counts.stale++;
    else counts.processed++;
  }
  return counts;
}
