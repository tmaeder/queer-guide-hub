import { expect, it, vi } from 'vitest';
vi.mock('cloudflare:workers', () => ({ DurableObject: class {} }));
import worker from '../src/index';
import { readQueueMetrics } from '../src/queue-metrics';
import { encodeEventBody } from '../src/event-body';
it('authenticates read-only metrics without sending or consuming messages', async () => {
  const events = {
    metrics: vi.fn(async () => ({ backlogCount: 0, backlogBytes: 0 })),
    send: vi.fn(),
  };
  const dlq = {
    metrics: vi.fn(async () => ({
      backlogCount: 2,
      backlogBytes: 1460,
      oldestMessageTimestamp: new Date('2026-10-23T18:00:00Z'),
    })),
    send: vi.fn(),
  };
  const env = { EMAIL_GATEWAY_SECRET: 'fixture', EVENT_QUEUE: events, EVENT_DLQ: dlq };
  expect(
    (await worker.fetch(new Request('https://gateway/queues/metrics'), env as never)).status,
  ).toBe(401);
  expect(events.metrics).not.toHaveBeenCalled();
  const response = await worker.fetch(
    new Request('https://gateway/queues/metrics', { headers: { Authorization: 'Bearer fixture' } }),
    env as never,
  );
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await response.json()).toMatchObject({
    events: { available: true, backlog_count: 0 },
    dead_letter: {
      available: true,
      backlog_count: 2,
      oldest_message_at: '2026-10-23T18:00:00.000Z',
    },
  });
  expect(events.send).not.toHaveBeenCalled();
  expect(dlq.send).not.toHaveBeenCalled();
});
it('keeps a failed queue unavailable independently of a measured empty queue', async () => {
  const unavailable = await readQueueMetrics({
    metrics: vi.fn().mockRejectedValue(new Error('offline')),
  });
  expect(unavailable).toEqual({
    available: false,
    backlog_count: null,
    backlog_bytes: null,
    oldest_message_at: null,
  });
  expect(await readQueueMetrics(undefined)).toEqual(unavailable);
  for (const backlogCount of [-1, NaN, Infinity, 0.5])
    expect(
      await readQueueMetrics({
        metrics: vi.fn().mockResolvedValue({ backlogCount, backlogBytes: 0 }),
      }),
    ).toEqual(unavailable);
  expect(
    await readQueueMetrics({
      metrics: vi.fn().mockResolvedValue({ backlogCount: 0, backlogBytes: 0 }),
    }),
  ).toMatchObject({ available: true, backlog_count: 0, oldest_message_at: null });
});
it('normalizes actual JSON-text envelopes without double encoding and retains malformed messages for retry', async () => {
  const event = {
    type: 'cf.email.sending.message.delivered',
    payload: { eventId: 'native-event' },
  };
  expect(encodeEventBody(event)).toBe(JSON.stringify(event));
  expect(encodeEventBody(JSON.stringify(event))).toBe(JSON.stringify(event));
  const request = vi.fn(
    async (_url: RequestInfo | URL, _options?: RequestInit) => new Response('{}', { status: 200 }),
  );
  vi.stubGlobal('fetch', request);
  try {
    const ack = vi.fn(),
      retry = vi.fn();
    await worker.queue(
      { messages: [{ body: JSON.stringify(event), ack, retry }] } as never,
      { EMAIL_EVENTS_SECRET: 'fixture', EMAIL_EVENTS_URL: 'https://backend/events' } as never,
    );
    expect(request.mock.calls[0][1]?.body).toBe(JSON.stringify(event));
    expect(ack).toHaveBeenCalledOnce();
    request.mockClear();
    ack.mockClear();
    await worker.queue(
      { messages: [{ body: 'not json', ack, retry }] } as never,
      { EMAIL_EVENTS_SECRET: 'fixture', EMAIL_EVENTS_URL: 'https://backend/events' } as never,
    );
    expect(request).not.toHaveBeenCalled();
    expect(ack).not.toHaveBeenCalled();
    expect(retry).toHaveBeenCalledWith({ delaySeconds: 60 });
  } finally {
    vi.unstubAllGlobals();
  }
});

it('uses the workerd redirect contract and never follows or acknowledges a redirect', async () => {
  const request = vi.fn(async (_url: RequestInfo | URL, options?: RequestInit) => {
    // Model the production runtime constraint which Node fetch does not enforce.
    if (options?.redirect !== 'manual') throw new TypeError('Unsupported redirect mode');
    return new Response(null, {
      status: 302,
      headers: { Location: 'https://other-origin.invalid' },
    });
  });
  vi.stubGlobal('fetch', request);
  try {
    const ack = vi.fn(),
      retry = vi.fn();
    await worker.queue(
      { messages: [{ body: { type: 'native-event' }, ack, retry }] } as never,
      { EMAIL_EVENTS_SECRET: 'fixture', EMAIL_EVENTS_URL: 'https://backend/events' } as never,
    );
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0][1]?.redirect).toBe('manual');
    expect(ack).not.toHaveBeenCalled();
    expect(retry).toHaveBeenCalledWith({ delaySeconds: 60 });
  } finally {
    vi.unstubAllGlobals();
  }
});

it('preserves unknown epoch-zero age and accepts documented millisecond timestamps', async () => {
  for (const oldestMessageTimestamp of [undefined, new Date(0), 0]) {
    expect(
      await readQueueMetrics({
        metrics: vi.fn().mockResolvedValue({
          backlogCount: 2,
          backlogBytes: 100,
          oldestMessageTimestamp,
        }),
      }),
    ).toEqual({ available: true, backlog_count: 2, backlog_bytes: 100, oldest_message_at: null });
  }
  expect(
    await readQueueMetrics({
      metrics: vi.fn().mockResolvedValue({
        backlogCount: 2,
        backlogBytes: 100,
        oldestMessageTimestamp: Date.parse('2026-10-25T18:00:00Z'),
      }),
    }),
  ).toMatchObject({ available: true, oldest_message_at: '2026-10-25T18:00:00.000Z' });
  for (const oldestMessageTimestamp of [new Date(NaN), Infinity, -1, 'yesterday']) {
    expect(
      await readQueueMetrics({
        metrics: vi.fn().mockResolvedValue({
          backlogCount: 2,
          backlogBytes: 100,
          oldestMessageTimestamp,
        }),
      }),
    ).toMatchObject({ available: false, backlog_count: null, oldest_message_at: null });
  }
});
