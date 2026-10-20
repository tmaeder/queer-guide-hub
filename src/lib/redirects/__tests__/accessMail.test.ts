import { describe, it, expect, vi } from 'vitest';
import {
  accessMailPayload,
  dispatchRedirectAccessMail,
  type AccessMailJob,
  type AccessMailDb,
} from '../../../../supabase/functions/_shared/redirect-access-mail';
const gateway = 'https://email-gateway.example.com';
const job: AccessMailJob = {
  id: '00000000-0000-4000-8000-000000000001',
  leaseId: '00000000-0000-4000-8000-000000000002',
  email: 'owner@example.invalid',
  from: 'Queer Guide <noreply@queer.guide>',
  event: 'requested',
};
function database() {
  const rpc = vi.fn<AccessMailDb['rpc']>(async (name) => ({
    data: name === 'claim_redirect_access_mail' ? [job] : true,
    error: null,
  }));
  return { rpc };
}
describe('durable access request email delivery', () => {
  it('does not claim jobs or call a provider before email is configured', async () => {
    const db = database(),
      fetcher = vi.fn<typeof fetch>();
    expect(await dispatchRedirectAccessMail(db, '', 'sender', fetcher, gateway)).toMatchObject({
      configured: false,
    });
    expect(db.rpc).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('uses fixed HTTPS delivery, no redirect following, and a stable idempotency key', async () => {
    const db = database(),
      fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response('{"status":"accepted","id":"provider-receipt"}', { status: 200 }),
        );
    expect(
      await dispatchRedirectAccessMail(db, 'fixture-provider-key', 'sender', fetcher, gateway),
    ).toMatchObject({ sent: 1 });
    expect(fetcher).toHaveBeenCalledWith(
      gateway + '/send',
      expect.objectContaining({
        redirect: 'error',
        headers: expect.objectContaining({ Authorization: 'Bearer fixture-provider-key' }),
      }),
    );
    expect(db.rpc).toHaveBeenCalledWith(
      'finish_redirect_access_mail',
      expect.objectContaining({
        p_id: job.id,
        p_lease: job.leaseId,
        p_provider_id: 'provider-receipt',
      }),
    );
    expect(accessMailPayload(job).html).toContain(
      'https://queer.guide/links-workspace?accessRequests=review',
    );
    expect(accessMailPayload({ ...job, event: 'approved' }).text).toContain('accessRequests=mine');
  });
  it('records bounded retry delays and omits provider error bodies', async () => {
    const db = database(),
      fetcher = vi.fn<typeof fetch>().mockResolvedValue(
        new Response('{"message":"PRIVATE PROVIDER DETAILS"}', {
          status: 429,
          headers: { 'Retry-After': '999999999999999999999999' },
        }),
      );
    await dispatchRedirectAccessMail(db, 'fixture', 'sender', fetcher, gateway);
    expect(db.rpc).toHaveBeenCalledWith(
      'finish_redirect_access_mail',
      expect.objectContaining({
        p_retry: true,
        p_retry_after: 82800,
        p_error: 'Email provider returned HTTP 429',
      }),
    );
    expect(JSON.stringify(db.rpc.mock.calls)).not.toContain('PRIVATE PROVIDER DETAILS');
  });
  it('retries ambiguous network failures with the identical body and provider key', async () => {
    const db = database(),
      fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('timeout'));
    await dispatchRedirectAccessMail(db, 'fixture', 'sender', fetcher, gateway);
    await dispatchRedirectAccessMail(db, 'fixture', 'changed sender', fetcher, gateway);
    expect(fetcher.mock.calls[0][1]?.body).toBe(fetcher.mock.calls[1][1]?.body);
    expect(fetcher.mock.calls[0][1]?.headers).toEqual(fetcher.mock.calls[1][1]?.headers);
    expect(db.rpc).toHaveBeenCalledWith(
      'finish_redirect_access_mail',
      expect.objectContaining({ p_provider_id: null, p_retry: true }),
    );
  });
  it('does not retry permanent provider rejection or acknowledge a superseded lease as sent', async () => {
    const db = database(),
      fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 422 }));
    await dispatchRedirectAccessMail(db, 'fixture', 'sender', fetcher, gateway);
    expect(db.rpc).toHaveBeenCalledWith(
      'finish_redirect_access_mail',
      expect.objectContaining({ p_retry: false }),
    );
    db.rpc.mockImplementation(async (name) => ({
      data: name === 'claim_redirect_access_mail' ? [job] : false,
      error: null,
    }));
    fetcher.mockResolvedValue(
      new Response('{"status":"accepted","id":"accepted"}', { status: 200 }),
    );
    expect(
      await dispatchRedirectAccessMail(db, 'fixture', 'sender', fetcher, gateway),
    ).toMatchObject({
      sent: 0,
      stale: 1,
    });
  });
  it('surfaces acknowledgement failures for lease recovery instead of reporting success', async () => {
    const db = database();
    db.rpc.mockImplementation(async (name) => ({
      data: name === 'claim_redirect_access_mail' ? [job] : null,
      error: name === 'finish_redirect_access_mail' ? { message: 'unavailable' } : null,
    }));
    await expect(
      dispatchRedirectAccessMail(
        db,
        'fixture',
        'sender',
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(new Response('{"status":"accepted","id":"accepted"}')),
        gateway,
      ),
    ).rejects.toThrow('Could not acknowledge');
  });
});
