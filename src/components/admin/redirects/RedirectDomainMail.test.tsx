import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RedirectApiError } from '@/lib/redirects/memberApi';
import {
  RedirectDomainMail,
  type InstructionDraft,
  type InstructionMail,
  type InstructionApi,
} from './RedirectDomainMail';
const domain = {
  id: 'domain-fixture',
  hostname: 'go.community.example.com',
  version: 'v1',
  disabled: false,
  archived: false,
};
const draft: InstructionDraft = {
  hostname: domain.hostname,
  version: 'v1',
  snapshot: 'a'.repeat(64),
  records: [
    { type: 'CNAME', name: domain.hostname, value: 'links.queer.guide.' },
    { type: 'TXT', name: '_qg-redirect.' + domain.hostname, value: 'qg-redirect=fixture' },
  ],
  latestMail: null,
};
const receipt: InstructionMail = {
  id: 'job-fixture',
  requestId: 'request-fixture',
  domainId: domain.id,
  domainVersion: 'v1',
  email: 'dns@example.com',
  state: 'sent',
  canCancel: false,
};
const key = 'redirect-dns-email:v1:owner:' + domain.id;
const body = {
  version: 'v1',
  snapshot: draft.snapshot,
  email: receipt.email,
  requestId: receipt.requestId,
};
function show(api: ReturnType<typeof vi.fn>, overrides: Record<string, unknown> = {}) {
  return render(
    <RedirectDomainMail
      accountId="owner"
      domain={domain}
      configured
      api={api as InstructionApi}
      {...overrides}
    />,
  );
}
async function prepare(email = receipt.email) {
  fireEvent.click(screen.getByRole('button', { name: 'Review email instructions' }));
  await screen.findByLabelText('Recipient email');
  fireEvent.change(screen.getByLabelText('Recipient email'), { target: { value: email } });
}
async function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Email these DNS records' }));
  await waitFor(() => expect(screen.queryByText('Checking email request…')).toBeNull());
}
beforeEach(() => sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());
describe('owner instruction email controls', () => {
  it('does not draft or send when unconfigured, disabled or archived', () => {
    const api = vi.fn();
    const view = show(api, { configured: false });
    expect(screen.queryByRole('button', { name: 'Review email instructions' })).toBeNull();
    view.rerender(
      <RedirectDomainMail
        accountId="owner"
        domain={{ ...domain, disabled: true }}
        configured
        api={api}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Review email instructions' })).toBeNull();
    view.rerender(
      <RedirectDomainMail
        accountId="owner"
        domain={{ ...domain, archived: true }}
        configured
        api={api}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Review email instructions' })).toBeNull();
    expect(api).not.toHaveBeenCalled();
  });
  it('reviews exact records, persists before POST, and describes acceptance truthfully', async () => {
    const api = vi
      .fn()
      .mockResolvedValueOnce(draft)
      .mockImplementationOnce(async (_path, _method, sent) => {
        expect(JSON.parse(sessionStorage.getItem(key)!).body).toEqual(sent);
        return { ...receipt, requestId: sent.requestId };
      });
    show(api);
    await prepare();
    expect(screen.getByText('links.queer.guide.')).toBeTruthy();
    expect(screen.getByText('qg-redirect=fixture')).toBeTruthy();
    await submit();
    expect(api.mock.calls[1][2]).toEqual({ ...body, requestId: expect.any(String) });
    expect(screen.getByText(/Inbox delivery is not confirmed/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancel unsent email' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Prepare another email' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'Prepare another email' })).toBeEnabled();
  });
  it('keeps exact UUID and body after a lost response, null lookup and reload', async () => {
    const api = vi
      .fn()
      .mockResolvedValueOnce(draft)
      .mockRejectedValueOnce(new Error('Connection lost'))
      .mockResolvedValueOnce({ mail: null })
      .mockResolvedValueOnce(receipt);
    const view = show(api);
    await prepare();
    await submit();
    const sent = api.mock.calls[1][2];
    fireEvent.click(screen.getByRole('button', { name: 'Refresh email status' }));
    await screen.findByText(/original request may still finish/);
    expect(screen.queryByLabelText('Recipient email')).toBeNull();
    view.unmount();
    show(api);
    fireEvent.click(screen.getByRole('button', { name: 'Retry same email request' }));
    await screen.findByText(/Inbox delivery is not confirmed/);
    expect(api.mock.calls[3][2]).toEqual(sent);
  });
  it('recovers a postflight 403 after mail acceptance without unlocking the recipient', async () => {
    const api = vi
      .fn()
      .mockResolvedValueOnce(draft)
      .mockRejectedValueOnce(new RedirectApiError('Owner access required', 403))
      .mockResolvedValueOnce({ mail: receipt });
    show(api);
    await prepare();
    await submit();
    expect(screen.queryByLabelText('Recipient email')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh email status' }));
    await screen.findByText(/Inbox delivery is not confirmed/);
    expect(api.mock.calls.filter((call) => call[1] === 'POST')).toHaveLength(1);
  });
  it('unlocks invalid first recipient and permits an IDN email to reach server validation', async () => {
    const api = vi
      .fn()
      .mockResolvedValueOnce(draft)
      .mockRejectedValueOnce(new RedirectApiError('Enter one valid recipient email address', 400))
      .mockResolvedValueOnce(receipt);
    show(api);
    await prepare('invalid');
    await submit();
    expect(sessionStorage.getItem(key)).toBeNull();
    fireEvent.change(screen.getByLabelText('Recipient email'), {
      target: { value: 'DNS@bücher.example' },
    });
    await submit();
    expect(api.mock.calls[2][2].email).toBe('DNS@bücher.example');
  });
  it('prepares a fresh UUID only after explicit acknowledgement of a prior accepted send', async () => {
    sessionStorage.setItem(key, JSON.stringify({ body, receipt }));
    const api = vi
      .fn()
      .mockResolvedValueOnce({ ...draft, latestMail: receipt })
      .mockResolvedValueOnce(receipt);
    show(api);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Prepare another email' }));
    await screen.findByLabelText('Recipient email');
    fireEvent.change(screen.getByLabelText('Recipient email'), {
      target: { value: 'second@example.com' },
    });
    await submit();
    expect(api.mock.calls[1][2].requestId).not.toBe(body.requestId);
    expect(api.mock.calls[1][2].email).toBe('second@example.com');
  });
  it('never unlocks an ambiguous persisted request after a later 400', async () => {
    sessionStorage.setItem(key, JSON.stringify({ body, receipt: null }));
    const api = vi.fn().mockRejectedValue(new RedirectApiError('Invalid request', 400));
    show(api);
    fireEvent.click(screen.getByRole('button', { name: 'Retry same email request' }));
    await screen.findByRole('alert');
    expect(JSON.parse(sessionStorage.getItem(key)!).body).toEqual(body);
    expect(screen.queryByLabelText('Recipient email')).toBeNull();
  });
  it('uses fresh digest and refuses a draft for a changed domain version', async () => {
    const api = vi
      .fn()
      .mockResolvedValueOnce({ ...draft, version: 'v2' })
      .mockResolvedValueOnce({ ...draft, snapshot: 'b'.repeat(64) })
      .mockResolvedValueOnce(receipt);
    show(api);
    fireEvent.click(screen.getByRole('button', { name: 'Review email instructions' }));
    await screen.findByText(/Domain settings changed/);
    await prepare();
    await submit();
    expect(api.mock.calls[2][2].snapshot).toBe('b'.repeat(64));
  });
  it('refreshes and cancels an existing unsent job when configuration is off and domain inactive', async () => {
    const queued = { ...receipt, state: 'queued', canCancel: true };
    sessionStorage.setItem(key, JSON.stringify({ body, receipt: queued }));
    const api = vi
      .fn()
      .mockResolvedValueOnce({ mail: queued })
      .mockResolvedValueOnce({ ...queued, state: 'cancelled', canCancel: false });
    show(api, { configured: false, domain: { ...domain, disabled: true } });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh email status' }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Cancel unsent email' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel unsent email' }));
    await screen.findByText('Email cancelled before sending.');
    expect(api.mock.calls[1]).toEqual([
      '/domains/' + domain.id + '/instruction-emails/' + receipt.id + '/cancel',
      'POST',
      {},
    ]);
  });
  it('loads private latest server status in a fresh inactive unconfigured tab', async () => {
    const api = vi
      .fn()
      .mockResolvedValueOnce({ mail: { ...receipt, state: 'queued', canCancel: true } })
      .mockResolvedValueOnce({ ...receipt, state: 'cancelled', canCancel: false });
    show(api, { configured: false, domain: { ...domain, archived: true } });
    fireEvent.click(screen.getByRole('button', { name: 'Check previous email status' }));
    await screen.findByText(/Queued for sending/);
    expect(api.mock.calls[0][0]).toBe('/domains/' + domain.id + '/instruction-emails');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel unsent email' }));
    await screen.findByText('Email cancelled before sending.');
  });
  it('explains an empty private history without preparing a new email', async () => {
    const api = vi.fn().mockResolvedValue({ mail: null });
    show(api, { configured: false });
    fireEvent.click(screen.getByRole('button', { name: 'Check previous email status' }));
    await screen.findByText(/No previous instruction email was found/);
    expect(screen.queryByLabelText('Recipient email')).toBeNull();
  });
  it('does not claim cancellation after an inflight conflict', async () => {
    sessionStorage.setItem(
      key,
      JSON.stringify({ body, receipt: { ...receipt, state: 'queued', canCancel: true } }),
    );
    const api = vi.fn().mockRejectedValue(new RedirectApiError('Sending has started', 409));
    show(api);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel unsent email' }));
    await screen.findByRole('alert');
    expect(screen.queryByText('Email cancelled before sending.')).toBeNull();
  });
  it('isolates accounts and ignores late responses after account switch', async () => {
    let resolve!: (value: InstructionDraft) => void;
    const api = vi.fn().mockImplementation(
      () =>
        new Promise<InstructionDraft>((done) => {
          resolve = done;
        }),
    );
    const view = show(api);
    fireEvent.click(screen.getByRole('button', { name: 'Review email instructions' }));
    view.rerender(
      <RedirectDomainMail accountId="another-owner" domain={domain} configured api={api} />,
    );
    await act(async () => resolve(draft));
    expect(screen.queryByLabelText('Recipient email')).toBeNull();
    expect(screen.getByRole('button', { name: 'Review email instructions' })).toBeTruthy();
  });
  it('does not clear an unresolved old request using a null lookup alone', async () => {
    sessionStorage.setItem(key, JSON.stringify({ body, receipt: null }));
    const api = vi.fn().mockResolvedValueOnce({ mail: null }).mockResolvedValueOnce(draft);
    show(api, { domain: { ...domain, version: 'v2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Prepare another email' }));
    await screen.findByRole('alert');
    expect(JSON.parse(sessionStorage.getItem(key)!).body).toEqual(body);
  });
  it('clears an uncreated stale request only with null lookup and a different fresh version', async () => {
    sessionStorage.setItem(key, JSON.stringify({ body, receipt: null }));
    const current = { ...draft, version: 'v2' };
    const api = vi.fn().mockResolvedValueOnce({ mail: null }).mockResolvedValue(current);
    show(api, { domain: { ...domain, version: 'v2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Prepare another email' }));
    await screen.findByLabelText('Recipient email');
    expect(sessionStorage.getItem(key)).toBeNull();
  });
});
