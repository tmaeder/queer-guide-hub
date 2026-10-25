import { describe, expect, it, vi } from 'vitest';
import {
  dispatchRedirectDomainJobs,
  domainProviderConfig,
  domainProviderInput,
  type DomainProviderDb,
  type DomainProviderJob,
} from '../../../../supabase/functions/_shared/redirect-domain-provider';
const id = '00000000-0000-4000-8000-000000000001',
  lease = '00000000-0000-4000-8000-000000000002',
  operation = '00000000-0000-4000-8000-000000000003',
  provider = '00000000-0000-4000-8000-000000000004',
  nonce = '00000000-0000-4000-8000-000000000005';
const config = {
  zoneId: 'a'.repeat(32),
  token: 'fixture-provider-token',
  cnameTarget: 'links.queer.guide',
};
const job: DomainProviderJob = {
  id,
  lease,
  operation,
  zoneId: config.zoneId,
  cnameTarget: config.cnameTarget,
  hostname: 'links.example.com',
  kind: 'preflight',
  providerId: null,
  adoptId: null,
  desired: true,
};
const snapshot = {
  id: provider,
  hostname: job.hostname,
  status: 'active',
  ssl: {
    status: 'pending_validation',
    type: 'dv',
    method: 'txt',
    private_key: 'PRIVATE KEY',
    validation_records: [
      { txt_name: '_acme-challenge.links.example.com', txt_value: 'public-validation' },
      { txt_name: 'private.other.com', txt_value: 'PRIVATE OTHER HOST' },
    ],
  },
  ownership_verification: {
    name: '_cf-custom-hostname.links.example.com',
    value: 'provider-ownership',
  },
};
function database(value: DomainProviderJob = job) {
  return {
    rpc: vi.fn<DomainProviderDb['rpc']>(async (name) => ({
      data: [
        'reserve_redirect_domain_renewal',
        'begin_redirect_domain_validation_restart',
      ].includes(name)
        ? null
        : name === 'claim_redirect_domain_jobs'
          ? [value]
          : name === 'begin_redirect_domain_create'
            ? nonce
            : true,
      error: null,
    })),
  };
}
function completion(db: ReturnType<typeof database>) {
  return [...db.rpc.mock.calls]
    .reverse()
    .find(([name]) => name === 'finish_redirect_domain_job')?.[1].p_result;
}
const ok = (result: unknown) => Response.json({ success: true, result });
describe('durable domain provider adapter', () => {
  it('restarts validation once using the exact observed SSL settings after SQL authorization', async () => {
    const db = database({ ...job, kind: 'refresh', providerId: provider });
    let used = false;
    const original = db.rpc.getMockImplementation()!;
    db.rpc.mockImplementation(async (name, args) => {
      if (name !== 'begin_redirect_domain_validation_restart') return original(name, args);
      expect(args).toMatchObject({
        p_provider: provider,
        p_lease: lease,
        p_operation: operation,
        p_zone: config.zoneId,
        p_target: config.cnameTarget,
      });
      const data = !used;
      used = true;
      return { data, error: null };
    });
    const fetcher = vi.fn<typeof fetch>(async () => ok(snapshot));
    await dispatchRedirectDomainJobs(db, config, fetcher);
    expect(fetcher.mock.calls.map((call) => call[1]?.method)).toEqual(['GET', 'PATCH']);
    expect(JSON.parse(fetcher.mock.calls[1][1]!.body as string)).toEqual({
      ssl: { type: 'dv', method: 'txt' },
    });
    expect(completion(db)).toMatchObject({
      kind: 'status',
      id: provider,
      sslStatus: 'pending_validation',
    });
    await dispatchRedirectDomainJobs(db, config, fetcher);
    expect(fetcher.mock.calls.map((call) => call[1]?.method)).toEqual(['GET', 'PATCH', 'GET']);
  });
  it('inspects status after an ambiguous PATCH without repeating it', async () => {
    const db = database({ ...job, kind: 'refresh', providerId: provider });
    let reserved = false;
    const original = db.rpc.getMockImplementation()!;
    db.rpc.mockImplementation(async (name, args) => {
      if (name !== 'begin_redirect_domain_validation_restart') return original(name, args);
      const data = !reserved;
      reserved = true;
      return { data, error: null };
    });
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
      if (init?.method === 'PATCH') throw new Error('connection lost');
      return ok(snapshot);
    });
    await dispatchRedirectDomainJobs(db, config, fetcher);
    expect(completion(db)).toMatchObject({
      kind: 'error',
      retry: true,
      error: expect.stringContaining('without repeating'),
    });
    await dispatchRedirectDomainJobs(db, config, fetcher);
    expect(fetcher.mock.calls.filter((call) => call[1]?.method === 'PATCH')).toHaveLength(1);
    expect(completion(db)).toMatchObject({ kind: 'status' });
  });
  it('refuses unknown SSL configuration and mismatched objects before any PATCH', async () => {
    for (const value of [
      { ...snapshot, ssl: { status: 'pending_validation' } },
      { ...snapshot, id: nonce },
    ]) {
      const db = database({ ...job, kind: 'refresh', providerId: provider });
      const original = db.rpc.getMockImplementation()!;
      db.rpc.mockImplementation(async (name, args) =>
        name === 'begin_redirect_domain_validation_restart'
          ? { data: true, error: null }
          : original(name, args),
      );
      const fetcher = vi.fn(async () => ok(value));
      await dispatchRedirectDomainJobs(db, config, fetcher);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(completion(db)).toMatchObject({ kind: 'error' });
    }
  });
  it.each([true, false])(
    'requires a current renewal receipt (%s) before refreshing known TLS state',
    async (currentReceipt) => {
      const db = database({ ...job, kind: 'refresh', providerId: provider });
      db.rpc.mockImplementation(async (name) => ({
        data:
          name === 'begin_redirect_domain_validation_restart'
            ? false
            : name === 'claim_redirect_domain_jobs'
              ? [{ ...job, kind: 'refresh', providerId: provider }]
              : name === 'reserve_redirect_domain_renewal'
                ? {
                    actor: id,
                    version: operation,
                    attempt: nonce,
                    verification: {
                      name: '_qg-redirect.' + job.hostname,
                      value: 'qg-redirect=' + 'a'.repeat(64),
                    },
                  }
                : name === 'finish_redirect_domain_renewal'
                  ? currentReceipt
                  : true,
        error: null,
      }));
      const fetcher = vi.fn(async (input: RequestInfo | URL) =>
        new URL(String(input)).hostname === 'cloudflare-dns.com'
          ? Response.json(
              {
                Status: 0,
                Question: [{ name: '_qg-redirect.' + job.hostname, type: 16 }],
                Answer: [
                  {
                    name: '_qg-redirect.' + job.hostname,
                    type: 16,
                    data: '"qg-redirect=' + 'a'.repeat(64) + '"',
                  },
                ],
              },
              { headers: { 'Content-Type': 'application/dns-json' } },
            )
          : ok(snapshot),
      );
      await dispatchRedirectDomainJobs(db, config, fetcher);
      expect(db.rpc).toHaveBeenCalledWith(
        'finish_redirect_domain_renewal',
        expect.objectContaining({
          p_id: id,
          p_lease: lease,
          p_operation: operation,
          p_version: operation,
          p_attempt: nonce,
          p_outcome: 'verified',
        }),
      );
      expect(fetcher).toHaveBeenCalledTimes(currentReceipt ? 2 : 1);
      expect(completion(db)).toMatchObject(
        currentReceipt
          ? { kind: 'status', id: provider }
          : { kind: 'error', error: 'Provider response could not be verified' },
      );
    },
  );
  it('stays idle without dedicated valid configuration and validates reviewed owner actions', async () => {
    expect(domainProviderConfig('bad', 'token', config.cnameTarget)).toBeNull();
    expect(domainProviderConfig(config.zoneId, '', config.cnameTarget)).toBeNull();
    expect(domainProviderConfig(config.zoneId, config.token, 'https://example.com')).toBeNull();
    expect(domainProviderConfig(config.zoneId, config.token, config.cnameTarget)).toEqual(config);
    expect(() => domainProviderInput({ version: id, zoneId: config.zoneId }, 'connect')).toThrow();
    expect(() => domainProviderInput({ version: id }, 'confirm-absence')).toThrow();
    expect(
      domainProviderInput({ version: id, confirmedAbsent: true }, 'confirm-absence'),
    ).toMatchObject({ version: id });
    const db = database(),
      fetcher = vi.fn();
    expect(await dispatchRedirectDomainJobs(db, null, fetcher)).toMatchObject({
      configured: false,
    });
    expect(db.rpc).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('preflights, records intent before POST, binds the receipt and keeps only safe validation fields', async () => {
    const db = database();
    const fetcher = vi.fn<typeof fetch>(async (_url, options) => {
      if (options?.method === 'POST') {
        expect(db.rpc).toHaveBeenCalledWith('begin_redirect_domain_create', {
          p_id: id,
          p_lease: lease,
          p_operation: operation,
        });
        return ok(snapshot);
      }
      return ok([]);
    });
    expect(await dispatchRedirectDomainJobs(db, config, fetcher)).toMatchObject({
      processed: 1,
      failed: 0,
    });
    expect(fetcher.mock.calls[1][1]).toMatchObject({
      method: 'POST',
      redirect: 'error',
      body: JSON.stringify({ hostname: job.hostname, ssl: { method: 'txt', type: 'dv' } }),
    });
    expect(db.rpc).toHaveBeenCalledWith('record_redirect_domain_provider', {
      p_id: id,
      p_nonce: nonce,
      p_provider: provider,
      p_mode: 'created',
    });
    expect(completion(db)).toMatchObject({
      kind: 'status',
      hostnameStatus: 'active',
      sslStatus: 'pending_validation',
    });
    expect(JSON.stringify(completion(db))).not.toContain('PRIVATE');
  });
  it('quarantines pre-existing and uncertain hostnames without a second POST', async () => {
    for (const kind of ['preflight', 'reconcile'] as const) {
      const db = database({ ...job, kind }),
        fetcher = vi.fn<typeof fetch>(async () => ok([snapshot]));
      await dispatchRedirectDomainJobs(db, config, fetcher);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(completion(db)).toMatchObject({
        kind: 'candidates',
        candidates: [{ id: provider, hostname: job.hostname }],
      });
      expect(db.rpc).not.toHaveBeenCalledWith('begin_redirect_domain_create', expect.anything());
    }
    const db = database({ ...job, kind: 'reconcile' });
    await dispatchRedirectDomainJobs(
      db,
      config,
      vi.fn(async () => ok([])),
    );
    expect(completion(db)).toEqual({ kind: 'candidates', candidates: [] });
  });
  it('treats uncertain create responses as review and preserves definite rejection/rate-limit information', async () => {
    const db = database();
    let calls = 0;
    await dispatchRedirectDomainJobs(
      db,
      config,
      vi.fn(async () => {
        if (calls++ === 0) return ok([]);
        throw new Error('PRIVATE NETWORK DETAIL');
      }),
    );
    expect(completion(db)).toMatchObject({ kind: 'error', retry: true, definiteRejection: false });
    expect(JSON.stringify(completion(db))).not.toContain('PRIVATE');
    const limited = database();
    calls = 0;
    await dispatchRedirectDomainJobs(
      limited,
      config,
      vi.fn(async () =>
        calls++ === 0
          ? ok([])
          : Response.json(
              { success: false, errors: [{ message: 'PRIVATE TOKEN' }] },
              { status: 429, headers: { 'Retry-After': '600' } },
            ),
      ),
    );
    expect(completion(limited)).toMatchObject({
      retry: true,
      definiteRejection: true,
      retryAfter: 600,
    });
    expect(JSON.stringify(completion(limited))).not.toContain('PRIVATE');
  });
  it('does not create if the durable start guard declines permission or ownership', async () => {
    const db = database();
    db.rpc.mockImplementation(async (name) => ({
      data:
        name === 'claim_redirect_domain_jobs'
          ? [job]
          : name === 'begin_redirect_domain_create'
            ? null
            : true,
      error: null,
    }));
    const fetcher = vi.fn(async () => ok([]));
    await dispatchRedirectDomainJobs(db, config, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(completion(db)).toEqual({ kind: 'cancelled' });
  });
  it('checks the stored object hostname before deletion and treats confirmed 404 as absent', async () => {
    const db = database({ ...job, kind: 'delete', providerId: provider, desired: false });
    const fetcher = vi.fn<typeof fetch>(async (_url, options) =>
      options?.method === 'DELETE' ? ok({ id: provider }) : ok(snapshot),
    );
    await dispatchRedirectDomainJobs(db, config, fetcher);
    expect(fetcher.mock.calls.map((call) => call[1]?.method)).toEqual(['GET', 'DELETE']);
    expect(completion(db)).toEqual({ kind: 'deleted', id: provider });
    const mismatch = database({ ...job, kind: 'delete', providerId: provider, desired: false }),
      wrong = vi.fn(async () => ok({ ...snapshot, hostname: 'other.example.com' }));
    await dispatchRedirectDomainJobs(mismatch, config, wrong);
    expect(wrong).toHaveBeenCalledTimes(1);
    expect(completion(mismatch)).toMatchObject({ kind: 'error' });
    const absent = database({ ...job, kind: 'delete', providerId: provider, desired: false });
    await dispatchRedirectDomainJobs(
      absent,
      config,
      vi.fn(async () => Response.json({ success: false }, { status: 404 })),
    );
    expect(completion(absent)).toEqual({ kind: 'deleted', id: provider });
  });
  it('refuses redirects, malformed/oversized payloads and changed zone bindings without unsafe writes', async () => {
    const db = database({ ...job, zoneId: 'b'.repeat(32) }),
      fetcher = vi.fn();
    await dispatchRedirectDomainJobs(db, config, fetcher);
    expect(fetcher).not.toHaveBeenCalled();
    expect(completion(db)).toMatchObject({ retry: false });
    for (const response of [
      new Response('<html>gateway</html>', { status: 404 }),
      new Response('x'.repeat(131073), { headers: { 'Content-Type': 'application/json' } }),
    ]) {
      const failed = database({ ...job, kind: 'refresh', providerId: provider });
      await dispatchRedirectDomainJobs(
        failed,
        config,
        vi.fn(async () => response),
      );
      expect(completion(failed)).toMatchObject({ kind: 'error' });
    }
  });
});
