import { UUID, tokenDigest } from './redirect-api.ts';
export interface DomainInstructionRecord {
  type: 'CNAME' | 'TXT';
  name: string;
  value: string;
}
export interface DomainInstructionMailConfig {
  key: string;
  from: string;
  target: string;
  fingerprint: string;
}
export interface DomainInstructionMailDb {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
}
export interface DomainInstructionMailJob {
  id: string;
  leaseId: string;
  email: string;
  from: string;
  hostname: string;
  records: DomainInstructionRecord[];
  payload: Record<string, unknown> | null;
}
const hasMailControl = (value: string) =>
  Array.from(value).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
export function instructionRecipient(value: unknown): string {
  if (typeof value !== 'string' || hasMailControl(value))
    throw new Error('Enter one valid recipient email address');
  const input = value.trim(),
    at = input.lastIndexOf('@'),
    local = input.slice(0, at);
  if (
    at < 1 ||
    local.length > 64 ||
    !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) ||
    /(^\.|\.$|\.\.)/.test(local)
  )
    throw new Error('Enter one valid recipient email address');
  let domain: string;
  try {
    const url = new URL('https://' + input.slice(at + 1));
    if (url.pathname !== '/' || url.port || url.username || url.password || url.search || url.hash)
      throw new Error();
    domain = url.hostname;
  } catch {
    throw new Error('Enter one valid recipient email address');
  }
  if (
    !/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/.test(domain) ||
    input.slice(at + 1).endsWith('.') ||
    /[\s\\/@?#%:]/.test(input.slice(at + 1))
  )
    throw new Error('Enter one valid recipient email address');
  const email = local + '@' + domain;
  if (email.length > 254) throw new Error('Enter one valid recipient email address');
  return email;
}
export function instructionMailInput(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Provide a recipient and reviewed DNS instructions');
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).some(
      (field) => !['version', 'snapshot', 'email', 'requestId'].includes(field),
    ) ||
    typeof input.version !== 'string' ||
    !UUID.test(input.version) ||
    typeof input.requestId !== 'string' ||
    !UUID.test(input.requestId) ||
    typeof input.snapshot !== 'string' ||
    !/^[a-f0-9]{64}$/.test(input.snapshot)
  )
    throw new Error('Reload the instructions before sending');
  return {
    version: input.version,
    snapshot: input.snapshot,
    requestId: input.requestId,
    email: instructionRecipient(input.email),
  };
}
export async function domainInstructionMailConfig(
  key: string,
  from: string,
  target: string,
): Promise<DomainInstructionMailConfig | null> {
  if (
    !key ||
    key.length > 4096 ||
    /\s/.test(key) ||
    !from ||
    from.length > 320 ||
    hasMailControl(from) ||
    target.length > 239 ||
    !/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/.test(target) ||
    /(?:^|\.)(?:localhost|local|internal|home|test|invalid|example|onion)$/.test(target)
  )
    return null;
  try {
    const match = from.trim().match(/^([^<>]+) <([^<>]+)>$/),
      address = instructionRecipient(match ? match[2] : from);
    if (match && (!match[1].trim() || match[1].length > 100)) return null;
    return {
      key,
      from: match ? match[1].trim() + ' <' + address + '>' : address,
      target,
      fingerprint: await tokenDigest(key),
    };
  } catch {
    return null;
  }
}
const escapeInstructionHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
/** v1 content. The exact first payload is persisted before sending and reused on every retry. */
export function domainInstructionMailPayload(job: DomainInstructionMailJob) {
  const records = job.records
    .map((record) => 'Type: ' + record.type + '\nName: ' + record.name + '\nValue: ' + record.value)
    .join('\n\n');
  const intro =
    'A Queer Guide workspace owner asked you to configure DNS for ' + job.hostname + '.';
  const review =
    'Review existing DNS records before changing them. A CNAME can replace conflicting records and affect another site. If this hostname is the DNS zone apex, use your provider’s CNAME flattening or ALIAS support; ask the owner for help if your provider does not support it. No A or AAAA address is supplied.';
  const follow =
    'These records are a snapshot. Ask the requester for refreshed instructions if setup has changed. Keep the ownership TXT record for future checks. After saving the records, ask the requester to check ownership, the certificate and branded routing in Queer Guide; sending this email does not complete those checks.';
  const text = intro + '\n\n' + records + '\n\n' + review + '\n\n' + follow;
  return {
    from: job.from,
    to: [job.email],
    subject:
      job.hostname.length <= 170
        ? 'DNS setup for ' + job.hostname
        : 'DNS setup instructions from Queer Guide',
    text,
    html:
      '<p>' +
      escapeInstructionHtml(intro) +
      '</p><pre style="white-space:pre-wrap;word-break:break-all">' +
      escapeInstructionHtml(records) +
      '</pre><p>' +
      escapeInstructionHtml(review) +
      '</p><p>' +
      escapeInstructionHtml(follow) +
      '</p>',
  };
}
async function instructionProviderJson(response: Response) {
  if (
    !response.body ||
    !response.headers.get('Content-Type')?.toLowerCase().includes('application/json')
  ) {
    await response.body?.cancel();
    throw new Error('Invalid email provider response');
  }
  const reader = response.body.getReader(),
    decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0,
    text = '',
    done = false;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) {
        done = true;
        break;
      }
      size += part.value.byteLength;
      if (size > 16384) throw new Error('Email provider response exceeds limit');
      text += decoder.decode(part.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    if (!done) {
      try {
        await reader.cancel();
      } catch {
        /* A timed-out fetch may already have closed the body. */
      }
    }
    reader.releaseLock();
  }
}
function instructionRetryAfter(response: Response) {
  const raw = response.headers.get('Retry-After');
  if (!raw) return null;
  const value = /^\d+$/.test(raw) ? Number(raw) : Math.ceil((Date.parse(raw) - Date.now()) / 1000);
  return Number.isFinite(value) ? Math.min(82800, Math.max(0, value)) : null;
}
export async function dispatchDomainInstructionMail(
  db: DomainInstructionMailDb,
  config: DomainInstructionMailConfig | null,
  fetcher: typeof fetch = fetch,
  jobId: string | null = null,
) {
  const counts = {
    configured: config !== null,
    sent: 0,
    deferred: 0,
    rejected: 0,
    uncertain: 0,
    stale: 0,
  };
  if (!config) return counts;
  const claim = await db.rpc('claim_redirect_domain_instruction_mail', {
    p_from: config.from,
    p_target: config.target,
    p_fingerprint: config.fingerprint,
    p_limit: jobId ? 1 : 3,
    p_id: jobId,
  });
  if (claim.error || !Array.isArray(claim.data) || claim.data.length > (jobId ? 1 : 3))
    throw new Error('Instruction email queue unavailable');
  for (const job of claim.data as DomainInstructionMailJob[]) {
    if (
      !UUID.test(job.id) ||
      !UUID.test(job.leaseId) ||
      !Array.isArray(job.records) ||
      job.records.length > 12
    )
      throw new Error('Invalid instruction email claim');
    const prepared = await db.rpc('prepare_redirect_domain_instruction_mail', {
      p_id: job.id,
      p_lease: job.leaseId,
      p_target: config.target,
      p_fingerprint: config.fingerprint,
      p_payload: job.payload ? null : domainInstructionMailPayload(job),
    });
    if (prepared.error) throw new Error('Instruction email could not be prepared');
    if (!prepared.data) {
      counts.stale++;
      continue;
    }
    let outcome: 'sent' | 'retry' | 'rejected' | 'unknown' = 'unknown',
      providerId: string | null = null,
      retry = true,
      retryAfter: number | null = null;
    try {
      const response = await fetcher('https://api.resend.com/emails', {
        method: 'POST',
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
        headers: {
          Authorization: 'Bearer ' + config.key,
          'Content-Type': 'application/json',
          'Idempotency-Key': 'qg-domain-instructions/v1/' + job.id,
        },
        body: JSON.stringify(prepared.data),
      });
      retryAfter = instructionRetryAfter(response);
      if (response.ok) {
        const data = await instructionProviderJson(response);
        if (data && typeof data.id === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(data.id)) {
          outcome = 'sent';
          providerId = data.id;
        }
      } else if (response.status === 409) {
        try {
          const data = await instructionProviderJson(response);
          if (data?.name === 'invalid_idempotent_request') retry = false;
        } catch {
          /* Unknown conflict remains ambiguous under the same request identity. */
        }
      } else {
        outcome =
          response.status === 429
            ? 'retry'
            : response.status === 408 ||
                response.status >= 500 ||
                (response.status >= 300 && response.status < 400)
              ? 'unknown'
              : 'rejected';
        retry = outcome !== 'rejected';
        await response.body?.cancel();
      }
    } catch {
      /* A timeout or lost receipt can follow acceptance. Retry only the persisted identity/payload. */
    }
    const finish = await db.rpc('finish_redirect_domain_instruction_mail', {
      p_id: job.id,
      p_lease: job.leaseId,
      p_outcome: outcome,
      p_provider_id: providerId,
      p_retry_after: retryAfter,
      p_retry: retry,
    });
    if (finish.error) throw new Error('Instruction email outcome could not be recorded');
    if (!finish.data) counts.stale++;
    else if (outcome === 'sent') counts.sent++;
    else if (outcome === 'unknown' && !retry) counts.uncertain++;
    else if (outcome === 'rejected') counts.rejected++;
    else counts.deferred++;
  }
  return counts;
}
