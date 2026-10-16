/* eslint no-control-regex: "off" -- Rejecting ASCII control characters is intentional input/header validation. */
import { UUID } from './redirect-api.ts';
import {
  webhookUrl,
  resolveWebhookAddress,
  webhookSignatures,
  sendPinnedWebhook,
  WebhookTransportError,
  type WebhookNetwork,
  type WebhookErrorCode,
} from './redirect-webhook-transport.ts';
export const WEBHOOK_EVENT_TYPES = [
  'link.created',
  'link.updated',
  'link.deleted',
  'link.clicked',
  'lead.created',
  'sale.created',
] as const;
export function createWebhookSecret() {
  return 'whsec_' + btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
}
export function webhookInput(input: unknown, create = false) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Provide webhook fields');
  const data = input as Record<string, unknown>,
    result: Record<string, unknown> = {};
  if (
    Object.keys(data).some(
      (key) =>
        ![
          'version',
          'name',
          'url',
          'eventTypes',
          'linkIds',
          'includeCustomerId',
          'enabled',
          'restore',
        ].includes(key),
    ) ||
    !Object.keys(data).length
  )
    throw new Error('Invalid webhook fields');
  if (create) {
    if ('version' in data || 'restore' in data)
      throw new Error('Creation does not accept a version or restore');
  } else {
    Object.assign(result, webhookVersionInput({ version: data.version }));
    if (Object.keys(data).length === 1) throw new Error('Provide webhook changes');
  }
  if (create || 'name' in data) {
    if (
      typeof data.name !== 'string' ||
      !data.name.trim() ||
      data.name.trim().length > 100 ||
      /[\x00-\x1f\x7f]/.test(data.name)
    )
      throw new Error('Webhook name must be 1–100 characters');
    result.name = data.name.trim();
  }
  if (create || 'url' in data) {
    if (typeof data.url !== 'string') throw new Error('Provide a public HTTPS endpoint');
    result.url = webhookUrl(data.url).href;
  }
  if ('eventTypes' in data) {
    if (
      !Array.isArray(data.eventTypes) ||
      !data.eventTypes.length ||
      data.eventTypes.length > 6 ||
      data.eventTypes.some((type) => !(WEBHOOK_EVENT_TYPES as readonly unknown[]).includes(type))
    )
      throw new Error('Choose supported webhook events');
    result.eventTypes = [...new Set(data.eventTypes)];
  }
  if ('linkIds' in data) {
    if (
      data.linkIds !== null &&
      (!Array.isArray(data.linkIds) ||
        !data.linkIds.length ||
        data.linkIds.length > 1000 ||
        data.linkIds.some((id) => typeof id !== 'string' || !UUID.test(id)))
    )
      throw new Error('Choose managed links or all links');
    result.linkIds = data.linkIds === null ? null : [...new Set(data.linkIds as string[])];
  }
  for (const key of ['includeCustomerId', 'enabled', 'restore'])
    if (key in data) {
      if (typeof data[key] !== 'boolean') throw new Error('Invalid webhook option');
      result[key] = data[key];
    }
  return result;
}
export function webhookVersionInput(input: unknown) {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).length !== 1 ||
    typeof (input as Record<string, unknown>).version !== 'string' ||
    !UUID.test((input as { version: string }).version)
  )
    throw new Error('Provide the current version');
  return { version: (input as { version: string }).version };
}
export function webhookPage(query: URLSearchParams, history = false) {
  const allowed = history ? ['limit', 'cursor'] : ['limit', 'cursor', 'archived'];
  if ([...query.keys()].some((key) => !allowed.includes(key) || query.getAll(key).length !== 1))
    throw new Error('Invalid webhook page');
  const limit = Number(query.get('limit') ?? 50),
    cursor = query.get('cursor');
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error('Invalid webhook page size');
  if (
    cursor !== null &&
    (history
      ? !/^[1-9]\d{0,18}$/.test(cursor) || BigInt(cursor) > 9223372036854775807n
      : !UUID.test(cursor))
  )
    throw new Error('Invalid webhook cursor');
  const archived = query.get('archived');
  if (archived !== null && !['true', 'false'].includes(archived))
    throw new Error('Invalid archive option');
  return { limit, cursor, archived: archived === 'true' };
}
export interface WebhookDb {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
}
/** Narrow an RPC payload for property reads. Returns null rather than throwing;
 *  every call site below already has its own validity guard for the null case. */
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
export async function dispatchRedirectWebhooks(
  db: WebhookDb,
  network: WebhookNetwork,
  fetcher: typeof fetch = fetch,
) {
  const deadline = Date.now() + 40000;
  const summary = { claimed: 0, delivered: 0, retry: 0, failed: 0, cancelled: 0, changed: 0 };
  const cleanup = await db.rpc('prune_redirect_webhooks', { p_limit: 1000 });
  if (cleanup.error) throw new Error('Webhook cleanup unavailable');
  // New leases are taken in small rounds, not all at once before a long network batch.
  for (let round = 0; round < 8 && Date.now() < deadline; round++) {
    const claimed = await db.rpc('claim_redirect_webhook_deliveries', { p_limit: 4 });
    if (claimed.error || !Array.isArray(claimed.data) || claimed.data.length > 4)
      throw new Error('Webhook queue unavailable');
    if (!claimed.data.length) break;
    const outcomes = await Promise.allSettled(
      claimed.data.map(async (job: { id: string; lease: string; url: string }) => {
        if (!UUID.test(job.id) || !UUID.test(job.lease) || typeof job.url !== 'string')
          throw new Error('Invalid webhook lease');
        summary.claimed++;
        const started = Date.now(),
          signal = AbortSignal.timeout(20000);
        let status: number | null = null,
          error: WebhookErrorCode | null = null,
          excerpt = '',
          retryAfter: number | null = null;
        let secrets: string[] = [];
        try {
          const url = webhookUrl(job.url),
            address = await resolveWebhookAddress(url, signal, fetcher);
          const prepared = await db.rpc('prepare_redirect_webhook_delivery', {
            p_id: job.id,
            p_lease: job.lease,
          });
          if (prepared.error) {
            error = 'scope_changed';
          } else {
            const value = asRecord(prepared.data);
            if (
              !value ||
              value.id !== job.id ||
              value.url !== url.href ||
              !UUID.test(String(value.eventId)) ||
              !UUID.test(String(value.keyVersion)) ||
              typeof value.body !== 'string' ||
              new TextEncoder().encode(value.body).length > 32768 ||
              typeof value.secret !== 'string'
            )
              throw new WebhookTransportError('invalid_response');
            secrets = [
              value.secret,
              // Keep the original TRUTHINESS test, not just the type test: an empty-string
              // previousSecret must stay out, or `excerpt.replaceAll('', …)` below would
              // splice "[redacted]" between every character of the excerpt.
              ...(typeof value.previousSecret === 'string' && value.previousSecret
                ? [value.previousSecret]
                : []),
            ];
            const timestamp = Math.floor(Date.now() / 1000),
              signature = await webhookSignatures(
                secrets,
                String(value.eventId),
                timestamp,
                value.body,
              );
            signal.throwIfAborted();
            const receipt = await sendPinnedWebhook(
              url,
              address,
              value.body,
              {
                'webhook-id': String(value.eventId),
                'webhook-timestamp': String(timestamp),
                'webhook-signature': signature,
                'webhook-delivery-id': job.id,
                'webhook-key-version': String(value.keyVersion),
              },
              network,
              signal,
            );
            status = receipt.status;
            excerpt = receipt.excerpt;
            retryAfter = receipt.retryAfter;
            if (status < 200 || status >= 300) error = 'http_error';
          }
        } catch (cause) {
          error = signal.aborted
            ? 'timeout'
            : cause instanceof WebhookTransportError
              ? cause.code
              : 'network_error';
        }
        for (const secret of secrets)
          excerpt = excerpt
            .replaceAll(secret, '[redacted]')
            .replaceAll(secret.slice(6), '[redacted]');
        const completed = await db.rpc('finish_redirect_webhook_delivery', {
          p_id: job.id,
          p_lease: job.lease,
          p_status: status,
          p_error: error,
          p_excerpt: excerpt,
          p_duration: Math.min(60000, Math.max(0, Date.now() - started)),
          p_retry_after: retryAfter,
        });
        if (completed.error) {
          if (completed.error.code === 'P0002') {
            summary.changed++;
            return;
          }
          throw new Error('Webhook acknowledgement unavailable');
        }
        const state = asRecord(completed.data)?.state;
        if (!['delivered', 'retry', 'failed', 'cancelled'].includes(state as string))
          throw new Error('Invalid webhook acknowledgement');
        summary[state as 'delivered' | 'retry' | 'failed' | 'cancelled']++;
      }),
    );
    if (outcomes.some((outcome) => outcome.status === 'rejected'))
      throw new Error('Webhook batch acknowledgement unavailable');
  }
  return summary;
}
