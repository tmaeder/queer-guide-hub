import { useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { memberRedirectApi, type MemberLink } from '@/lib/redirects/memberApi';
import type { RedirectWorkspaceRole } from '@/lib/redirects/roles';
import { formatDateTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AdminEmpty } from '@/components/admin/primitives/AdminEmpty';
import { AdminInlineSpinner, AdminTextSkeleton } from '@/components/admin/primitives/AdminLoading';

import type { IntegrationInstallation } from '../../../../sdk/redirects/typescript';
export type RedirectIntegrationInstallation = IntegrationInstallation;
interface Page<T> {
  data: T[];
  count: number;
  nextCursor: string | null;
}
interface Setup {
  requestId: string;
  provider: 'segment' | 'gtm';
  name: string;
  linkIds: string[];
  expiresAt: string;
}
const PROVIDERS = { segment: 'Segment', gtm: 'Google Tag Manager' };
const STATUS = {
  configured: 'Credential configured',
  revoked: 'Revoked',
  expired: 'Expired',
  unavailable: 'Access changed',
};

export function RedirectIntegrationInstallations({
  userId,
  workspaceRole: role,
}: {
  userId: string;
  workspaceRole: RedirectWorkspaceRole;
}) {
  const session = useQuery({
    queryKey: ['redirect-member', userId, 'session'],
    queryFn: () => memberRedirectApi<{ role: RedirectWorkspaceRole }>('/session'),
    retry: false,
  });
  const canInstall =
    !session.isError && (session.data?.role === 'owner' || session.data?.role === 'member');
  const [form, setForm] = useState(false),
    [provider, setProvider] = useState<Setup['provider']>('segment');
  const [name, setName] = useState(''),
    [search, setSearch] = useState(''),
    [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState<Setup | null>(null),
    [busy, setBusy] = useState(false);
  const [credential, setCredential] = useState<string | null>(null),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const [revoking, setRevoking] = useState<string | null>(null);
  const list = useInfiniteQuery({
    queryKey: ['redirect-member', userId, 'integrations', role, session.data?.role],
    enabled: session.isSuccess,
    gcTime: 0,
    retry: false,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      memberRedirectApi<Page<RedirectIntegrationInstallation>>(
        '/integrations?' +
          new URLSearchParams({ limit: '50', ...(pageParam ? { after: pageParam } : {}) }),
        'GET',
        undefined,
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const links = useInfiniteQuery({
    queryKey: ['redirect-member', userId, 'integration-links', role, search],
    gcTime: 0,
    retry: false,
    enabled: canInstall && form && !list.isError,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      memberRedirectApi<Page<MemberLink>>(
        '/links?' +
          new URLSearchParams({
            filters: JSON.stringify({ search, isArchived: false }),
            limit: '50',
            ...(pageParam ? { cursor: pageParam } : {}),
          }),
        'GET',
        undefined,
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const rows =
    list.isError || session.isError ? [] : (list.data?.pages.flatMap((page) => page.data) ?? []);
  const choices = links.isError
    ? []
    : (links.data?.pages.flatMap((page) => page.data).filter((link) => link.canEdit) ?? []);
  const submit = async () => {
    const setup = pending ?? {
      requestId: crypto.randomUUID(),
      provider,
      name: name.trim(),
      linkIds: selected,
      expiresAt: new Date(Date.now() + 90 * 86400000).toISOString(),
    };
    setPending(setup);
    setBusy(true);
    setError('');
    setCredential(null);
    try {
      const result = await memberRedirectApi<{
        created: boolean;
        installation: RedirectIntegrationInstallation;
        credential: string | null;
      }>('/integrations', 'POST', { ...setup });
      setCredential(result.credential);
      setMessage(
        result.created
          ? 'Credential configured. Finish the provider steps below and verify an event in its debugger.'
          : 'This setup was already created. Its one-time key cannot be recovered. Revoke it and create a replacement if you did not save the key.',
      );
      setForm(false);
      setPending(null);
      setSelected([]);
      setName('');
      await list.refetch();
    } catch (cause) {
      setError(
        (cause instanceof Error ? cause.message : 'Setup response was not confirmed.') +
          ' Retry the same setup or check its status.',
      );
      await list.refetch();
    } finally {
      setBusy(false);
    }
  };
  const recover = async () => {
    if (!pending) return;
    setBusy(true);
    setError('');
    try {
      const receipt = await memberRedirectApi<{
        installation: RedirectIntegrationInstallation | null;
      }>('/integrations?requestId=' + encodeURIComponent(pending.requestId));
      if (receipt.installation) {
        setPending(null);
        setForm(false);
        setCredential(null);
        setMessage(
          'Setup exists. Its one-time key cannot be recovered. Revoke it and create a replacement if you did not save the key.',
        );
      } else
        setMessage(
          'No committed setup was found. Retry the same setup using its retained request ID.',
        );
      await list.refetch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not check setup status.');
    } finally {
      setBusy(false);
    }
  };
  const revoke = async (id: string) => {
    setBusy(true);
    setCredential(null);
    setError('');
    try {
      await memberRedirectApi('/integrations/' + id, 'DELETE');
      setRevoking(null);
      setMessage(
        'Integration credential revoked. Remove the adapter or secret from your provider when convenient.',
      );
      await list.refetch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not revoke this setup.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-label="Conversion adapter credentials" className="space-y-4 border-t pt-4">
      <h3 className="font-semibold">Conversion adapter credentials</h3>
      <p className="text-sm text-muted-foreground">
        Configure a server credential for selected editable links, then install the adapter in your
        provider. Provider installation and debugger verification are separate steps.
      </p>
      {session.isError && <p role="alert">Workspace access changed. {session.error.message}</p>}
      {list.isPending && <AdminTextSkeleton lines={3} />}
      {list.isError && (
        <div role="alert">
          <p>Could not load integration setups. {list.error.message}</p>
          <Button variant="outline" onClick={() => void list.refetch()}>
            Retry setups
          </Button>
        </div>
      )}
      {list.isRefetching && <AdminInlineSpinner />}
      {canInstall && !list.isError && (
        <Button
          variant="outline"
          disabled={busy || form}
          onClick={() => {
            setForm(true);
            setMessage('');
            setCredential(null);
            setError('');
          }}
        >
          Configure conversion adapter
        </Button>
      )}
      {form && canInstall && !list.isError && (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div>
            <Label htmlFor="integration-provider">Provider</Label>
            <select
              id="integration-provider"
              className="w-full rounded-element border bg-background p-2"
              value={provider}
              disabled={busy || !!pending}
              onChange={(event) => setProvider(event.target.value as Setup['provider'])}
            >
              <option value="segment">Segment</option>
              <option value="gtm">Google Tag Manager</option>
            </select>
          </div>
          <div>
            <Label htmlFor="integration-name">Setup name</Label>
            <Input
              id="integration-name"
              required
              maxLength={100}
              value={name}
              disabled={busy || !!pending}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="integration-link-search">Search editable links</Label>
            <Input
              id="integration-link-search"
              value={search}
              disabled={busy || !!pending}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <fieldset disabled={busy || !!pending} className="space-y-4">
            <legend className="text-sm font-medium">Selected links ({selected.length}/100)</legend>
            {links.isPending && <AdminTextSkeleton lines={2} />}
            {links.isError && <p role="alert">Could not load links. {links.error.message}</p>}
            {choices.map((link) => (
              <label key={link.id} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(link.id)}
                  disabled={!selected.includes(link.id) && selected.length >= 100}
                  onChange={(event) =>
                    setSelected((current) =>
                      event.target.checked
                        ? [...current, link.id]
                        : current.filter((id) => id !== link.id),
                    )
                  }
                />
                <span>{link.shortUrl}</span>
              </label>
            ))}
            {!links.isPending && !links.isError && !choices.length && (
              <AdminEmpty noun="editable links" variant="inline" filtered={!!search} />
            )}
          </fieldset>
          {links.hasNextPage && (
            <Button
              type="button"
              variant="outline"
              disabled={busy || !!pending || links.isFetchingNextPage}
              onClick={() => void links.fetchNextPage()}
            >
              Load more links
            </Button>
          )}
          <p className="text-sm text-muted-foreground">
            This key expires in 90 days and can only record lead/sale conversions for the selected
            links. Current member and folder permissions still apply.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              disabled={busy || links.isError || !name.trim() || !selected.length}
            >
              {busy ? 'Saving…' : pending ? 'Retry same setup' : 'Create conversion credential'}
            </Button>
            {pending ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void recover()}
              >
                Check setup status
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setForm(false)}
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {credential && canInstall && !list.isError && !session.isError && (
        <div className="space-y-4">
          <Label htmlFor="integration-one-time-key">One-time server credential</Label>
          <Input id="integration-one-time-key" readOnly value={credential} />
          <p className="text-sm">
            Save this key in your provider’s server secret setting. It is shown once. Keep it out of
            browser tags and source code.
          </p>
          <Button variant="outline" onClick={() => setCredential(null)}>
            Hide key
          </Button>
        </div>
      )}
      {!list.isPending && !list.isError && !rows.length && (
        <AdminEmpty noun="integration setups" variant="inline" />
      )}
      <ul className="space-y-4">
        {rows.map((row) => (
          <li key={row.id} className="space-y-4 border-t py-4">
            <div>
              <p className="font-medium">
                {row.name} · {PROVIDERS[row.provider]}
              </p>
              <p className="text-sm text-muted-foreground">
                {STATUS[row.status]} · {row.linkCount} links · expires{' '}
                {formatDateTime(row.expiresAt)}
              </p>
              <p className="text-sm text-muted-foreground">
                {row.credentialPrefix}…
                {row.credentialLastUsedAt
                  ? ' · Credential last used ' + formatDateTime(row.credentialLastUsedAt)
                  : ''}
              </p>
            </div>
            {canInstall &&
              row.canRevoke &&
              (revoking === row.id ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm">Revoke this adapter’s conversion key?</span>
                  <Button variant="destructive" disabled={busy} onClick={() => void revoke(row.id)}>
                    Confirm revoke
                  </Button>
                  <Button variant="outline" disabled={busy} onClick={() => setRevoking(null)}>
                    Cancel revoke
                  </Button>
                </div>
              ) : (
                <Button variant="outline" disabled={busy} onClick={() => setRevoking(row.id)}>
                  Revoke credential
                </Button>
              ))}
          </li>
        ))}
      </ul>
      {list.hasNextPage && (
        <Button
          variant="outline"
          disabled={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          Load more setups
        </Button>
      )}
      <div className="space-y-4 text-sm">
        <p>
          For Segment, create a Destination Function and save the key in its apiKey secret setting.
          For Google Tag Manager, import the template into a server container and keep the key in a
          server variable. Send a trusted backend event with qg_click_id and stable customer/event
          IDs, then confirm the conversion in your provider’s debugger and Redirects tracking.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <a href="/integrations/redirects/segment-destination.js" download>
              Download Segment adapter
            </a>
          </Button>
          <Button variant="outline" asChild>
            <a href="/integrations/redirects/google-server-conversions.tpl" download>
              Download Google server adapter
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}
