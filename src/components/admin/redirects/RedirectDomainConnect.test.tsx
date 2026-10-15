import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RedirectDomainConnect,
  RedirectDomainConnectReturn,
  type DomainConnectOperation,
} from './RedirectDomainConnect';
const id = '00000000-0000-4000-8000-000000000001';
const domain = {
  id: '00000000-0000-4000-8000-000000000002',
  hostname: 'go.community.example.com',
  version: '00000000-0000-4000-8000-000000000003',
  ownershipVerified: false,
  verification: {
    type: 'TXT',
    name: '_qg-redirect.go.community.example.com',
    value: 'qg-redirect=' + 'a'.repeat(64),
  },
};
const review: DomainConnectOperation = {
  id,
  state: 'review',
  expiresAt: '2026-10-16T13:00:00Z',
  domain,
  outcome: null,
  discovery: { provider: 'cloudflare' },
};
const approval = {
  ...review,
  state: 'approved',
  approvalUrl:
    'https://dash.cloudflare.com/domainconnect/v2/domainTemplates/providers/queer.guide/services/redirects/apply?domain=example.com&host=go.community&sig=fixture',
};
function wrap(children: React.ReactNode) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      {children}
    </QueryClientProvider>,
  );
}
afterEach(() => window.history.replaceState({}, '', '/'));
describe('owner DNS provider approval', () => {
  it('keeps unconfigured and inactive setup unavailable without calling the API', () => {
    const api = vi.fn();
    const view = wrap(
      <RedirectDomainConnect
        domain={domain}
        configured={false}
        cnameTarget={null}
        disabled={false}
        api={api}
      />,
    );
    expect(screen.getByText(/Automatic setup is not enabled/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Check automatic setup' })).toBeNull();
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <RedirectDomainConnect
          domain={domain}
          configured
          cnameTarget="links.queer.guide"
          disabled
          api={api}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByRole('button', { name: 'Check automatic setup' })).toBeDisabled();
    expect(api).not.toHaveBeenCalled();
  });
  it('shows the exact CNAME/TXT records, requires review, then opens only the matching provider', async () => {
    const api = vi.fn().mockResolvedValueOnce(review).mockResolvedValueOnce(approval),
      navigate = vi.fn();
    wrap(
      <RedirectDomainConnect
        domain={domain}
        configured
        cnameTarget="links.queer.guide"
        disabled={false}
        api={api}
        navigate={navigate}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Check automatic setup' }));
    expect(await screen.findByText(domain.verification.value)).toBeVisible();
    expect(screen.getByText('CNAME · ' + domain.hostname)).toBeVisible();
    expect(screen.getByText('links.queer.guide.')).toBeVisible();
    const proceed = screen.getByRole('button', { name: 'Continue to Cloudflare' });
    expect(proceed).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'I reviewed these DNS records.' }));
    fireEvent.click(proceed);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(approval.approvalUrl));
    expect(api.mock.calls[0]).toEqual([
      '/domains/' + domain.id + '/dns-setup/discover',
      'POST',
      { version: domain.version },
    ]);
    expect(api.mock.calls[1]).toEqual([
      '/domains/' + domain.id + '/dns-setup/approve',
      'POST',
      { version: domain.version, operation: id },
    ]);
  });
  it('rejects a mismatched approval destination and keeps the current review visible', async () => {
    const api = vi
        .fn()
        .mockResolvedValueOnce(review)
        .mockResolvedValueOnce({
          ...approval,
          approvalUrl:
            'https://vercel.com/v2/domainTemplates/providers/queer.guide/services/redirects/apply',
        }),
      navigate = vi.fn();
    wrap(
      <RedirectDomainConnect
        domain={domain}
        configured
        cnameTarget="links.queer.guide"
        disabled={false}
        api={api}
        navigate={navigate}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Check automatic setup' }));
    fireEvent.click(await screen.findByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Cloudflare' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Provider approval is unavailable');
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByText(domain.verification.value)).toBeVisible();
  });
  it('leaves unsupported providers on the manual path and surfaces current-owner errors', async () => {
    const api = vi
      .fn()
      .mockResolvedValueOnce({
        ...review,
        state: 'unsupported',
        discovery: { reason: 'apex_not_supported' },
      })
      .mockRejectedValueOnce(new Error('Workspace owner access required'));
    wrap(
      <RedirectDomainConnect
        domain={domain}
        configured
        cnameTarget="links.queer.guide"
        disabled={false}
        api={api}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Check automatic setup' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Automatic setup supports subdomains',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Check automatic setup' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Workspace owner access required');
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
  it('does not navigate a stale account/domain after the component unmounts', async () => {
    let finish!: (value: DomainConnectOperation) => void;
    const pending = new Promise<DomainConnectOperation>((resolve) => {
      finish = resolve;
    });
    const api = vi.fn().mockResolvedValueOnce(review).mockReturnValueOnce(pending),
      navigate = vi.fn();
    const view = wrap(
      <RedirectDomainConnect
        domain={domain}
        configured
        cnameTarget="links.queer.guide"
        disabled={false}
        api={api}
        navigate={navigate}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Check automatic setup' }));
    fireEvent.click(await screen.findByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Cloudflare' }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    view.unmount();
    await act(async () => finish(approval));
    expect(navigate).not.toHaveBeenCalled();
  });
});
describe('DNS provider return', () => {
  it('looks up the current owner operation, ignores provider success and checks fresh DNS only on request', async () => {
    window.history.replaceState(
      {},
      '',
      '/admin/content/redirects?domain_connect=' + id + '&status=success&q=keep',
    );
    const api = vi
        .fn()
        .mockResolvedValueOnce(approval)
        .mockResolvedValueOnce({
          ...approval,
          state: 'complete',
          outcome: 'missing',
          domain: { ...domain, version: 'new-version' },
        }),
      changed = vi.fn().mockResolvedValue(undefined);
    wrap(<RedirectDomainConnectReturn accountId="owner" onChanged={changed} api={api} />);
    expect(await screen.findByText(domain.hostname)).toBeVisible();
    expect(api).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Returning from your provider does not confirm/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Check updated DNS records' }));
    expect(await screen.findByText(/The TXT record is not visible yet/)).toBeVisible();
    expect(api.mock.calls[1]).toEqual([
      '/domains/' + domain.id + '/dns-setup/complete',
      'POST',
      { version: domain.version, operation: id },
    ]);
    expect(changed).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss DNS setup' }));
    expect(window.location.search).toBe('?status=success&q=keep');
    expect(screen.queryByRole('region', { name: 'DNS setup return' })).toBeNull();
  });
  it('explains separate TLS/routing requirements after verified ownership', async () => {
    window.history.replaceState({}, '', '?domain_connect=' + id);
    const api = vi.fn().mockResolvedValue({ ...approval, state: 'complete', outcome: 'verified' });
    wrap(<RedirectDomainConnectReturn accountId="owner" onChanged={vi.fn()} api={api} />);
    expect(
      await screen.findByText(
        /Ownership confirmed. Continue with the certificate and branded routing checks/,
      ),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Check updated DNS records' })).toBeNull();
  });
  it('rejects invalid callback IDs and surfaces expired/changed operations without checking DNS', async () => {
    window.history.replaceState({}, '', '?domain_connect=bad');
    const api = vi.fn().mockRejectedValue(new Error('DNS setup expired or changed; restart setup'));
    const view = wrap(
      <RedirectDomainConnectReturn accountId="owner" onChanged={vi.fn()} api={api} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('This DNS setup link is invalid');
    expect(api).not.toHaveBeenCalled();
    view.unmount();
    window.history.replaceState({}, '', '?domain_connect=' + id);
    wrap(<RedirectDomainConnectReturn accountId="owner" onChanged={vi.fn()} api={api} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('DNS setup expired or changed');
    expect(api).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Check updated DNS records' })).toBeNull();
  });
});
