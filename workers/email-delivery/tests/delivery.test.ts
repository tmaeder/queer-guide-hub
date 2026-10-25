import { describe, expect, it, vi } from 'vitest';
import { validateDelivery } from '../src/protocol';
vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    constructor(
      public ctx: unknown,
      public env: unknown,
    ) {}
  },
}));
import worker, { EmailDelivery } from '../src/index';
const valid = {
  id: '879b1b00-cc6c-44ef-a671-95b344cb154c',
  category: 'transactional',
  from: 'Queer Guide <noreply@queer.guide>',
  to: 'recipient@example.com',
  subject: 'Welcome',
  html: '<p>Hello</p>',
  text: 'Hello',
};
function setup() {
  const stored = new Map();
  const storage = {
    get: vi.fn(async (k: string) => stored.get(k)),
    put: vi.fn(async (k: string, v: unknown) => {
      stored.set(k, v);
    }),
  };
  const ctx = { storage, blockConcurrencyWhile: async (f: () => unknown) => f() };
  const env = { EMAIL: { send: vi.fn(async () => ({ messageId: 'cf-message-1' })) } };
  return { stored, ctx, env, delivery: new EmailDelivery(ctx as never, env as never) };
}
describe('transactional gateway', () => {
  it('inspects persisted receipts without sending, including unknown identities and uncertain submissions', async () => {
    const s = setup();
    expect(await s.delivery.inspect()).toBeNull();
    expect(s.env.EMAIL.send).not.toHaveBeenCalled();
    s.env.EMAIL.send.mockRejectedValueOnce(new Error('unknown outcome'));
    await s.delivery.submit(validateDelivery(valid, 'queer.guide')!);
    expect(await s.delivery.inspect()).toMatchObject({ status: 'uncertain' });
    expect(s.env.EMAIL.send).toHaveBeenCalledTimes(1);
  });
  it('authenticates receipt inspection and accepts only immutable UUID identities', async () => {
    const inspect = vi.fn(async () => ({ status: 'accepted', id: 'provider' }));
    const env = {
      EMAIL_GATEWAY_SECRET: 'fixture',
      DELIVERIES: { idFromName: vi.fn((id) => id), get: vi.fn(() => ({ inspect })) },
    };
    expect(
      (await worker.fetch(new Request('https://gateway/receipts/' + valid.id), env as never))
        .status,
    ).toBe(401);
    expect(
      (
        await worker.fetch(
          new Request('https://gateway/receipts/not-an-id', {
            headers: { Authorization: 'Bearer fixture' },
          }),
          env as never,
        )
      ).status,
    ).toBe(400);
    const r = await worker.fetch(
      new Request('https://gateway/receipts/' + valid.id, {
        headers: { Authorization: 'Bearer fixture' },
      }),
      env as never,
    );
    expect(await r.json()).toEqual({
      found: true,
      receipt: { status: 'accepted', id: 'provider' },
    });
    expect(inspect).toHaveBeenCalledTimes(1);
  });
  it('rejects marketing, wrong sender, injected headers and multiple recipients', () => {
    expect(validateDelivery(valid, 'queer.guide')).toMatchObject({ to: valid.to });
    for (const change of [
      { category: 'newsletter' },
      { from: 'a@other.guide' },
      { to: ['a@example.com', 'b@example.com'] },
      { subject: 'Hello\r\nBcc: a@example.com' },
      { headers: { Authorization: 'secret' } },
      { headers: { 'X-Test': 'value\nInjected: true' } },
    ])
      expect(validateDelivery({ ...valid, ...change }, 'queer.guide')).toBeNull();
  });
  it('returns a durable receipt without submitting again', async () => {
    const s = setup();
    const input = validateDelivery(valid, 'queer.guide')!;
    expect(await s.delivery.submit(input)).toEqual({ status: 'accepted', id: 'cf-message-1' });
    expect(await s.delivery.submit(input)).toEqual({ status: 'accepted', id: 'cf-message-1' });
    expect(s.env.EMAIL.send).toHaveBeenCalledTimes(1);
  });
  it('rejects changed content under the same identity', async () => {
    const s = setup();
    const input = validateDelivery(valid, 'queer.guide')!;
    await s.delivery.submit(input);
    expect(await s.delivery.submit({ ...input, subject: 'Changed' })).toMatchObject({
      error: 'idempotency_conflict',
    });
    expect(s.env.EMAIL.send).toHaveBeenCalledTimes(1);
  });
  it('does not resend after an ambiguous provider failure', async () => {
    const s = setup();
    s.env.EMAIL.send.mockRejectedValueOnce(new Error('connection lost'));
    const input = validateDelivery(valid, 'queer.guide')!;
    expect(await s.delivery.submit(input)).toMatchObject({ status: 'uncertain' });
    expect(await s.delivery.submit(input)).toMatchObject({ status: 'uncertain' });
    expect(s.env.EMAIL.send).toHaveBeenCalledTimes(1);
  });
  it('retries only definite quota rejections', async () => {
    const s = setup();
    s.env.EMAIL.send.mockRejectedValueOnce({ code: 'E_RATE_LIMIT_EXCEEDED' });
    const input = validateDelivery(valid, 'queer.guide')!;
    expect(await s.delivery.submit(input)).toMatchObject({ status: 'retry' });
    expect(await s.delivery.submit(input)).toMatchObject({ status: 'accepted' });
    expect(s.env.EMAIL.send).toHaveBeenCalledTimes(2);
  });
  it('holds an interrupted submission after restart', async () => {
    const s = setup();
    s.ctx.storage.put.mockImplementationOnce(async () => {
      throw new Error('disk failed');
    });
    await expect(s.delivery.submit(validateDelivery(valid, 'queer.guide')!)).rejects.toThrow();
    expect(s.env.EMAIL.send).not.toHaveBeenCalled();
  });
  it('preserves an ambiguous accepted submission across a fresh object instance', async () => {
    const s = setup();
    const input = validateDelivery(valid, 'queer.guide')!;
    s.ctx.storage.put
      .mockImplementationOnce(async (key, value) => {
        s.stored.set(key, value);
      })
      .mockImplementationOnce(async () => {
        throw new Error('receipt commit interrupted');
      });
    await expect(s.delivery.submit(input)).rejects.toThrow();
    const restarted = new EmailDelivery(s.ctx as never, s.env as never);
    expect(await restarted.inspect()).toMatchObject({ status: 'uncertain' });
    expect(await restarted.submit(input)).toMatchObject({ status: 'uncertain' });
    expect(s.env.EMAIL.send).toHaveBeenCalledTimes(1);
  });
  it('retries failed event ingestion and acknowledges recovery, including safe replay', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValue(new Response('{}', { status: 200 }));
    const message = {
      body: { type: 'cf.email.sending.message.delivered' },
      ack: vi.fn(),
      retry: vi.fn(),
    };
    const env = {
      EMAIL_EVENTS_SECRET: 'fixture',
      EMAIL_EVENTS_URL: 'https://events.invalid/receiver',
    };
    try {
      await worker.queue({ messages: [message] } as never, env as never);
      expect(message.retry).toHaveBeenCalledWith({ delaySeconds: 60 });
      expect(message.ack).not.toHaveBeenCalled();
      await worker.queue({ messages: [message] } as never, env as never);
      await worker.queue({ messages: [message] } as never, env as never);
      expect(message.ack).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0][1]).toMatchObject({
        method: 'POST',
        redirect: 'manual',
        body: JSON.stringify(message.body),
      });
    } finally {
      fetchMock.mockRestore();
    }
  });
  it('authenticates before parsing or creating a delivery', async () => {
    const response = await worker.fetch(
      new Request('https://gateway/send', { method: 'POST', body: 'invalid' }),
      { EMAIL_GATEWAY_SECRET: 'expected' } as never,
    );
    expect(response.status).toBe(401);
  });
});
