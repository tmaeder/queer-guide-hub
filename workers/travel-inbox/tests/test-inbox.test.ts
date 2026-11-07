import { afterEach, expect, it, vi } from 'vitest';
import worker, { type Env } from '../src/index';

afterEach(() => vi.unstubAllGlobals());

it('stores test mail with a stable ID across retries and skips travel ingestion', async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockImplementation(async (_input, init) =>
      init?.method === 'HEAD'
        ? new Response(null, { headers: { 'content-range': '*/0' } })
        : new Response(null, { status: 201 }),
    );
  vi.stubGlobal('fetch', fetchMock);

  const env = {
    INBOX_DOMAIN: 'queer.guide',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-key',
  } as Env;

  for (const attempt of [1, 2]) {
    const raw = [
      'From: sender@example.com',
      'To: test@queer.guide',
      'Subject: DNS instructions',
      'Message-ID: <canary@example.com>',
      `X-Delivery-Attempt: ${attempt}`,
      '',
      'Set a CNAME to links.kampa.app.',
    ].join('\r\n');
    await worker.email(
      {
        to: 'TEST@queer.guide',
        from: 'sender@example.com',
        raw: new Response(raw).body!,
      },
      env,
      {} as ExecutionContext,
    );
  }

  expect(fetchMock).toHaveBeenCalledTimes(4);
  const inserts = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
  const [firstInsert, secondInsert] = inserts;
  expect(firstInsert?.[0]).toBe('https://example.supabase.co/rest/v1/email_ingestions');
  expect(firstInsert?.[1]?.headers).toMatchObject({
    prefer: 'resolution=ignore-duplicates,return=minimal',
  });
  expect(JSON.parse(String(firstInsert?.[1]?.body))).toMatchObject({
    id: expect.any(String),
    from_address: 'sender@example.com',
    to_address: 'test@queer.guide',
    subject: 'DNS instructions',
    body_text: 'Set a CNAME to links.kampa.app.',
    status: 'no_content',
  });
  expect(secondInsert?.[1]?.body).toBe(firstInsert?.[1]?.body);
});
