import { webcrypto } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  domainInstructionMailConfig,
  domainInstructionMailPayload,
  dispatchDomainInstructionMail,
  instructionMailInput,
  instructionRecipient,
  type DomainInstructionMailDb,
  type DomainInstructionMailJob,
} from '../../../../supabase/functions/_shared/redirect-domain-mail';
const id = '00000000-0000-4000-8000-000000000001',
  lease = '00000000-0000-4000-8000-000000000002';
const job: DomainInstructionMailJob = {
  id,
  leaseId: lease,
  email: 'dns@example.org',
  from: 'Queer Guide <noreply@queer.guide>',
  hostname: 'go.example.com',
  records: [
    { type: 'CNAME', name: 'go.example.com', value: 'links.queer.guide.' },
    { type: 'TXT', name: '_qg-redirect.go.example.com', value: 'qg-redirect=' + 'a'.repeat(64) },
  ],
  payload: null,
};
const config = {
  key: 'fixture-mail-provider',
  gatewayUrl: 'https://email-gateway.example.com',
  from: job.from,
  target: 'links.queer.guide',
  fingerprint: 'a'.repeat(64),
};
function database(prepared: unknown = domainInstructionMailPayload(job)) {
  const rpc = vi.fn<DomainInstructionMailDb['rpc']>(async (name) => ({
    data:
      name === 'claim_redirect_domain_instruction_mail'
        ? [job]
        : name === 'prepare_redirect_domain_instruction_mail'
          ? prepared
          : true,
    error: null,
  }));
  return { rpc };
}
beforeAll(() => vi.stubGlobal('crypto', webcrypto));
afterAll(() => vi.unstubAllGlobals());
describe('DNS instruction email boundaries', () => {
  it('accepts one address, preserves local case and normalizes IDN domains', () => {
    expect(instructionRecipient(' DNS+changes@EXAMPLE.ORG ')).toBe('DNS+changes@example.org');
    expect(instructionRecipient('dns@bücher.de')).toBe('dns@xn--bcher-kva.de');
    for (const email of [
      'a@example.org\r\nBcc:other@example.org',
      'a@example.org,b@example.org',
      'Name <a@example.org>',
      'a@localhost',
      'a@127.0.0.1',
      'a@bad..example.com',
      '.a@example.org',
      'a..b@example.org',
      'a.@example.org',
      'a@example.org/path',
      'a@example.org?x=1',
      'a@example.org:443',
      'a@example.org.',
      'a@-bad.example.org',
      'a@exa_mple.org',
      'a'.repeat(65) + '@example.org',
    ])
      expect(() => instructionRecipient(email)).toThrow();
  });
  it('rejects custom records/content and requires the current reviewed snapshot/request ID', () => {
    const input = {
      version: id,
      snapshot: 'b'.repeat(64),
      email: 'dns@EXAMPLE.ORG',
      requestId: lease,
    };
    expect(instructionMailInput(input)).toEqual({ ...input, email: 'dns@example.org' });
    for (const value of [
      null,
      [],
      {},
      { ...input, records: job.records },
      { ...input, from: 'spoof@example.org' },
      { ...input, subject: 'Custom mail' },
      { ...input, requestId: 'invalid' },
      { ...input, snapshot: 'wrong' },
    ])
      expect(() => instructionMailInput(value)).toThrow();
  });
  it('requires explicit valid sender/target configuration and exposes a key fingerprint rather than a key-derived client field', async () => {
    const actual = await domainInstructionMailConfig(
      config.key,
      config.from,
      config.target,
      config.gatewayUrl,
    );
    expect(actual).toMatchObject({
      ...config,
      fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(
      (await domainInstructionMailConfig(
        config.key,
        config.from,
        config.target,
        config.gatewayUrl,
      ))!.fingerprint,
    ).toBe(actual!.fingerprint);
    for (const [key, from, target] of [
      ['', config.from, config.target],
      [config.key, '', config.target],
      [config.key, 'sender@example.org\nBcc:other@example.org', config.target],
      [config.key, config.from, 'https://links.queer.guide'],
      [config.key, config.from, 'localhost'],
      ['bad key', config.from, config.target],
    ])
      expect(await domainInstructionMailConfig(key, from, target, config.gatewayUrl)).toBeNull();
  });
  it('renders exact record text, escapes HTML and keeps readiness/flattening statements honest', () => {
    const payload = domainInstructionMailPayload({
      ...job,
      records: [
        ...job.records,
        { type: 'TXT', name: '_acme-challenge.go.example.com', value: 'proof <tag> & "quote"' },
      ],
    });
    expect(payload.text).toContain('Type: CNAME\nName: go.example.com\nValue: links.queer.guide.');
    expect(payload.text).toContain('proof <tag> & "quote"');
    expect(payload.html).toContain('proof &lt;tag&gt; &amp; &quot;quote&quot;');
    expect(payload.html).not.toContain('proof <tag>');
    expect(payload.text).toContain('CNAME flattening or ALIAS');
    expect(payload.text).toContain('sending this email does not complete those checks');
    expect(payload.to).toEqual([job.email]);
    expect(payload).not.toHaveProperty('reply_to');
  });
});
describe('durable instruction mail transport', () => {
  it('does not claim or send before configuration exists', async () => {
    const db = database(),
      fetcher = vi.fn<typeof fetch>();
    expect(await dispatchDomainInstructionMail(db, null, fetcher)).toMatchObject({
      configured: false,
      sent: 0,
    });
    expect(db.rpc).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('prepares a current payload before one fixed HTTPS request and records acceptance, not inbox delivery', async () => {
    const db = database(),
      fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ status: 'accepted', id: 'provider-accepted' }));
    expect(await dispatchDomainInstructionMail(db, config, fetcher, id)).toMatchObject({ sent: 1 });
    expect(db.rpc.mock.calls[0]).toEqual([
      'claim_redirect_domain_instruction_mail',
      {
        p_from: config.from,
        p_target: config.target,
        p_fingerprint: config.fingerprint,
        p_limit: 1,
        p_id: id,
      },
    ]);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith(
      config.gatewayUrl + '/send',
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        cache: 'no-store',
        signal: expect.any(AbortSignal),
        headers: expect.objectContaining({ Authorization: 'Bearer ' + config.key }),
        body: expect.any(String),
      }),
    );
    expect(db.rpc.mock.calls[1][0]).toBe('prepare_redirect_domain_instruction_mail');
    expect(db.rpc.mock.calls[2]).toEqual([
      'finish_redirect_domain_instruction_mail',
      {
        p_id: id,
        p_lease: lease,
        p_outcome: 'sent',
        p_provider_id: 'provider-accepted',
        p_retry_after: null,
        p_retry: true,
      },
    ]);
  });
  it('does not send stale or unprepared jobs', async () => {
    const db = database(null),
      fetcher = vi.fn<typeof fetch>();
    expect(await dispatchDomainInstructionMail(db, config, fetcher)).toMatchObject({
      stale: 1,
      sent: 0,
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(db.rpc).toHaveBeenCalledTimes(2);
  });
  it('marks a lost receipt unknown and reuses the exact persisted body/key on retry', async () => {
    const payload = domainInstructionMailPayload(job);
    let stored = false;
    const rpc = vi.fn<DomainInstructionMailDb['rpc']>(async (name, args) => {
      if (name === 'claim_redirect_domain_instruction_mail')
        return { data: [{ ...job, payload: stored ? payload : null }], error: null };
      if (name === 'prepare_redirect_domain_instruction_mail') {
        if (stored) expect(args.p_payload).toBeNull();
        stored = true;
        return { data: payload, error: null };
      }
      return { data: true, error: null };
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('Lost response'))
      .mockResolvedValueOnce(Response.json({ status: 'accepted', id: 'same-provider-accepted' }));
    expect(await dispatchDomainInstructionMail({ rpc }, config, fetcher)).toMatchObject({
      deferred: 1,
      sent: 0,
    });
    expect(rpc.mock.calls.at(-1)![1]).toMatchObject({
      p_outcome: 'unknown',
      p_retry: true,
      p_provider_id: null,
    });
    expect(
      await dispatchDomainInstructionMail(
        { rpc },
        { ...config, from: 'New sender <new@example.org>' },
        fetcher,
      ),
    ).toMatchObject({ sent: 1 });
    expect(fetcher.mock.calls[0][1]!.body).toBe(fetcher.mock.calls[1][1]!.body);
    expect(fetcher.mock.calls[0][1]!.headers).toEqual(fetcher.mock.calls[1][1]!.headers);
  });
  it('keeps invalid/oversized success responses ambiguous and cancels oversized streams', async () => {
    let cancelled = false;
    const oversized = () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('x'.repeat(17000)));
          },
          cancel() {
            cancelled = true;
          },
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    for (const response of [
      Response.json({ accepted: true }),
      new Response('not-json', { headers: { 'Content-Type': 'application/json' } }),
      oversized(),
    ]) {
      const db = database(),
        fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
      expect(await dispatchDomainInstructionMail(db, config, fetcher)).toMatchObject({
        deferred: 1,
        sent: 0,
      });
      expect(db.rpc.mock.calls.at(-1)![1]).toMatchObject({
        p_outcome: 'unknown',
        p_provider_id: null,
      });
    }
    expect(cancelled).toBe(true);
  });
  it('handles throttling, rejections and both idempotency conflicts without inventing a new request', async () => {
    for (const [response, outcome, retry] of [
      [new Response('', { status: 429, headers: { 'Retry-After': '120' } }), 'retry', true],
      [Response.json({ name: 'validation_error' }, { status: 422 }), 'rejected', false],
      [Response.json({ name: 'concurrent_idempotent_requests' }, { status: 409 }), 'unknown', true],
      [Response.json({ name: 'invalid_idempotent_request' }, { status: 409 }), 'unknown', false],
    ] as const) {
      const db = database(),
        fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
      await dispatchDomainInstructionMail(db, config, fetcher);
      expect(fetcher).toHaveBeenCalledOnce();
      expect(db.rpc.mock.calls.at(-1)![1]).toMatchObject({
        p_outcome: outcome,
        p_retry: retry,
        ...(response.status === 429 ? { p_retry_after: 120 } : {}),
      });
    }
  });
  it('does not claim success when acknowledgement loses its lease or database fails', async () => {
    const db = database();
    db.rpc.mockImplementation(async (name) => ({
      data:
        name === 'claim_redirect_domain_instruction_mail'
          ? [job]
          : name === 'prepare_redirect_domain_instruction_mail'
            ? domainInstructionMailPayload(job)
            : false,
      error: null,
    }));
    expect(
      await dispatchDomainInstructionMail(
        db,
        config,
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(Response.json({ status: 'accepted', id: 'accepted' })),
      ),
    ).toMatchObject({ stale: 1, sent: 0 });
    db.rpc.mockResolvedValue({ data: null, error: { message: 'private database detail' } });
    await expect(dispatchDomainInstructionMail(db, config, vi.fn())).rejects.toThrow(
      'Instruction email queue unavailable',
    );
  });
});
