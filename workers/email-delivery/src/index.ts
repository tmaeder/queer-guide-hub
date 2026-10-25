import { DurableObject } from 'cloudflare:workers';
import { validateDelivery, type DeliveryInput, type Receipt } from './protocol';
import { readQueueMetrics } from './queue-metrics';
import { encodeEventBody } from './event-body';
const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
export class EmailDelivery extends DurableObject<Env> {
  async inspect(): Promise<Receipt | null> {
    const stored = await this.ctx.storage.get<{ receipt: Receipt }>('receipt');
    return stored?.receipt ?? null;
  }
  async submit(input: DeliveryInput): Promise<Receipt> {
    return this.ctx.blockConcurrencyWhile(async () => {
      const fingerprint = Array.from(
        new Uint8Array(
          await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(input))),
        ),
        (b) => b.toString(16).padStart(2, '0'),
      ).join('');
      const prior = await this.ctx.storage.get<{ fingerprint: string; receipt: Receipt }>(
        'receipt',
      );
      if (prior && prior.fingerprint !== fingerprint)
        return { status: 'failed', error: 'idempotency_conflict' };
      if (prior && prior.receipt.status !== 'retry') return prior.receipt;
      // Persist uncertainty BEFORE submission; an isolate restart must not resend.
      await this.ctx.storage.put('receipt', {
        fingerprint,
        receipt: { status: 'uncertain', error: 'submission_outcome_unknown' },
      });
      let receipt: Receipt;
      try {
        const named = input.from.match(/^([^<>]+)<([^<>]+)>$/);
        const result = await this.env.EMAIL.send({
          from: named ? { email: named[2].trim(), name: named[1].trim() } : input.from,
          to: input.to,
          subject: input.subject,
          html: input.html,
          text: input.text,
          headers: input.headers,
        });
        receipt = result.messageId
          ? { status: 'accepted', id: result.messageId }
          : { status: 'uncertain', error: 'provider_receipt_missing' };
      } catch (error) {
        const code =
          typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
        const retry = ['E_RATE_LIMIT_EXCEEDED', 'E_DAILY_LIMIT_EXCEEDED'].includes(code);
        const rejected = [
          'E_VALIDATION_ERROR',
          'E_FIELD_MISSING',
          'E_SENDER_NOT_VERIFIED',
          'E_RECIPIENT_NOT_ALLOWED',
          'E_SENDER_DOMAIN_NOT_AVAILABLE',
          'E_CONTENT_TOO_LARGE',
          'E_HEADER_NOT_ALLOWED',
          'E_HEADER_USE_API_FIELD',
          'E_HEADER_VALUE_INVALID',
          'E_HEADER_VALUE_TOO_LONG',
          'E_HEADER_NAME_INVALID',
          'E_HEADERS_TOO_LARGE',
          'E_HEADERS_TOO_MANY',
          'E_DELIVERY_FAILED',
        ].includes(code);
        receipt = {
          status: retry
            ? 'retry'
            : code === 'E_RECIPIENT_SUPPRESSED'
              ? 'suppressed'
              : rejected
                ? 'failed'
                : 'uncertain',
          error: code || 'provider_outcome_unknown',
          ...(retry ? { retryAfterSeconds: code === 'E_DAILY_LIMIT_EXCEEDED' ? 86400 : 60 } : {}),
        };
      }
      await this.ctx.storage.put('receipt', { fingerprint, receipt });
      return receipt;
    });
  }
}
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (
      !env.EMAIL_GATEWAY_SECRET ||
      req.headers.get('Authorization') !== `Bearer ${env.EMAIL_GATEWAY_SECRET}`
    )
      return json({ error: 'Unauthorized' }, 401);
    const url = new URL(req.url);
    if (req.method === 'GET' && url.pathname === '/queues/metrics') {
      const [events, dead_letter] = await Promise.all([
        readQueueMetrics(env.EVENT_QUEUE),
        readQueueMetrics(env.EVENT_DLQ),
      ]);
      return json({ observed_at: new Date().toISOString(), events, dead_letter });
    }
    if (req.method === 'GET' && url.pathname.startsWith('/receipts/')) {
      const id = url.pathname.slice('/receipts/'.length);
      if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))
        return json({ error: 'Invalid identity' }, 400);
      try {
        const receipt = await env.DELIVERIES.get(env.DELIVERIES.idFromName(id)).inspect();
        return json({ found: receipt !== null, receipt });
      } catch {
        return json({ error: 'Receipt unavailable' }, 503);
      }
    }
    if (req.method !== 'POST' || url.pathname !== '/send') return json({ error: 'Not found' }, 404);
    try {
      const reader = req.body?.getReader();
      if (!reader) return json({ error: 'Body required' }, 400);
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 600000) {
          await reader.cancel();
          return json({ error: 'Message too large' }, 413);
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const input = validateDelivery(
        JSON.parse(new TextDecoder().decode(bytes)),
        env.SENDER_DOMAIN,
      );
      if (!input) return json({ error: 'Invalid transactional message' }, 400);
      return json(await env.DELIVERIES.get(env.DELIVERIES.idFromName(input.id)).submit(input));
    } catch {
      return json({ error: 'Delivery service unavailable' }, 503);
    }
  },
  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    if (!env.EMAIL_EVENTS_SECRET || !env.EMAIL_EVENTS_URL.startsWith('https://'))
      throw new Error('Email events not configured');
    for (const message of batch.messages) {
      try {
        const response = await fetch(env.EMAIL_EVENTS_URL, {
          method: 'POST',
          // workerd rejects redirect:"error" before any network I/O. Manual
          // preserves the credential boundary; every 3xx remains a retry below.
          redirect: 'manual',
          signal: AbortSignal.timeout(15000),
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${env.EMAIL_EVENTS_SECRET}`,
          },
          body: encodeEventBody(message.body),
        });
        await response.body?.cancel();
        if (response.ok) message.ack();
        else {
          console.warn('email_event_ingestion_retry', { status: response.status });
          message.retry({ delaySeconds: 60 });
        }
      } catch {
        console.warn('email_event_ingestion_retry', { status: 'network_or_timeout' });
        message.retry({ delaySeconds: 60 });
      }
    }
  },
} satisfies ExportedHandler<Env, unknown>;
