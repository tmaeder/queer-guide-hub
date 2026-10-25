import { AdminEmpty } from '@/components/admin/primitives/AdminEmpty';
import { useEffect, useRef, useState, useId } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { memberRedirectApi } from '@/lib/redirects/memberApi';
import {
  WEBHOOK_EVENTS,
  webhookPage,
  type RedirectWebhook,
  type WebhookDelivery,
  type WebhookEvent,
} from '@/lib/redirects/webhooks';
export type WebhookPreset = Pick<
  RedirectWebhook,
  'name' | 'url' | 'eventTypes' | 'includeCustomerId'
>;
export function RedirectWebhooks() {
  const { user } = useAuth();
  return user ? <WebhookWorkspace key={user.id} account={user.id} /> : null;
}
export function RedirectWebhookCreate({
  preset,
  onClose,
}: {
  preset: WebhookPreset;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const client = useQueryClient();
  if (!user) return null;
  const account = user.id;
  const refresh = async () => {
    await client.cancelQueries({ queryKey: ['redirect-webhooks', account] });
    await client.invalidateQueries({ queryKey: ['redirect-webhooks', account] });
  };
  return (
    <WebhookEditor
      key={account + ':' + preset.url + ':' + preset.includeCustomerId}
      row={null}
      defaults={preset}
      account={account}
      refresh={refresh}
      close={onClose}
    />
  );
}
function WebhookWorkspace({ account }: { account: string }) {
  const client = useQueryClient();
  const [cursor, setCursor] = useState<string | null>(null),
    [archived, setArchived] = useState(false),
    [selected, setSelected] = useState<RedirectWebhook | null>(null),
    [creating, setCreating] = useState(false),
    [creationEpoch, setCreationEpoch] = useState(0);
  const queryKey = ['redirect-webhooks', account, archived, cursor];
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      webhookPage<RedirectWebhook>(
        '/webhooks?limit=50&archived=' +
          archived +
          (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''),
        signal,
      ),
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: true,
  });
  const refresh = async () => {
    await client.cancelQueries({ queryKey: ['redirect-webhooks', account] });
    await client.invalidateQueries({ queryKey: ['redirect-webhooks', account] });
  };
  return (
    <section className="space-y-4 border-t pt-4" aria-label="Outgoing webhooks">
      <div>
        <h3 className="font-semibold">Outgoing webhooks</h3>
        <p className="text-sm text-muted-foreground">
          Send signed link, click, lead, and sale events to your HTTPS endpoint.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => {
            setSelected(null);
            setCreationEpoch((previous) => previous + 1);
            setCreating(true);
          }}
        >
          Add webhook
        </Button>
        <Button
          variant="outline"
          aria-pressed={archived}
          onClick={() => {
            setArchived(!archived);
            setCursor(null);
            setSelected(null);
            setCreating(false);
          }}
        >
          {archived ? 'Hide archived' : 'Include archived'}
        </Button>
        <Button variant="outline" onClick={() => void refresh()}>
          Reload
        </Button>
      </div>
      {query.isPending && <p role="status">Loading webhooks…</p>}
      {query.isError && <p role="alert">Could not load webhooks. {query.error.message}</p>}
      {!query.isError && query.data && (
        <>
          <ul className="divide-y">
            {query.data.data.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-4">
                <div className="min-w-0">
                  <p className="font-medium break-words">{row.name}</p>
                  <p className="text-xs text-muted-foreground break-all">{row.url}</p>
                  <p className="text-sm">
                    {row.deletedAt ? 'Archived' : row.enabled ? 'Active' : 'Paused'} ·{' '}
                    {row.eventTypes.length} event types
                  </p>
                </div>
                <Button
                  variant="outline"
                  aria-label={'Manage ' + row.name}
                  onClick={() => {
                    setSelected(row);
                    setCreating(false);
                  }}
                >
                  Manage
                </Button>
              </li>
            ))}
          </ul>
          {!query.data.data.length && <p>No webhooks in this view.</p>}
          <div className="flex gap-2">
            {cursor && (
              <Button variant="outline" onClick={() => setCursor(null)}>
                First page
              </Button>
            )}
            {query.data.nextCursor && (
              <Button variant="outline" onClick={() => setCursor(query.data.nextCursor)}>
                Next page
              </Button>
            )}
          </div>
        </>
      )}
      {creating && (
        <WebhookEditor
          key={'new:' + creationEpoch}
          row={null}
          account={account}
          refresh={refresh}
          close={() => setCreating(false)}
        />
      )}
      {selected && !query.isError && (
        <WebhookEditor
          key={selected.id}
          row={selected}
          account={account}
          refresh={refresh}
          close={() => setSelected(null)}
        />
      )}
    </section>
  );
}
function WebhookEditor({
  row,
  account,
  refresh,
  close,
  defaults,
}: {
  defaults?: WebhookPreset;
  row: RedirectWebhook | null;
  account: string;
  refresh: () => Promise<void>;
  close: () => void;
}) {
  const formId = useId();
  const [current, setCurrent] = useState(row),
    [name, setName] = useState(row?.name ?? defaults?.name ?? ''),
    [url, setUrl] = useState(row?.url ?? defaults?.url ?? ''),
    [events, setEvents] = useState<WebhookEvent[]>(
      row?.eventTypes ?? defaults?.eventTypes ?? ['link.clicked', 'lead.created', 'sale.created'],
    ),
    [linkIds, setLinkIds] = useState(row?.linkIds?.join('\n') ?? ''),
    [includeCustomerId, setIncludeCustomerId] = useState(
      row?.includeCustomerId ?? defaults?.includeCustomerId ?? false,
    ),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [secret, setSecret] = useState<string | null>(null),
    [confirm, setConfirm] = useState<'archive' | 'rotate' | 'pause' | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const act = async (
    action: 'save' | 'archive' | 'rotate' | 'test' | 'toggle' | 'restore' | 'pause',
  ) => {
    if (busy) return;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setNotice('');
    try {
      const base = '/webhooks' + (current ? '/' + current.id : '');
      let path = base,
        method: 'POST' | 'PATCH' | 'DELETE' = current ? 'PATCH' : 'POST';
      let values: Record<string, unknown> = current ? { version: current.version } : {};
      if (action === 'save') {
        values = {
          ...values,
          name,
          url,
          eventTypes: events,
          linkIds: linkIds.trim() ? linkIds.split(/[\s,]+/).filter(Boolean) : null,
          includeCustomerId,
        };
      } else if (action === 'archive') method = 'DELETE';
      else if (action === 'toggle' || action === 'pause')
        values.enabled = action === 'pause' ? false : !current!.enabled;
      else if (action === 'restore') Object.assign(values, { restore: true, enabled: false });
      else {
        path += '/' + action;
        method = 'POST';
      }
      const result = await memberRedirectApi<
        RedirectWebhook & { secret?: string; retryAfter?: number }
      >(path, method, values, abort.signal);
      if (abort.signal.aborted) return;
      if (result.retryAfter) {
        setNotice('Try again in ' + result.retryAfter + ' seconds.');
        return;
      }
      if (action === 'test') {
        setNotice('Test delivery queued. Refresh history to see the receipt.');
        return;
      }
      setCurrent(result);
      if (result.secret) setSecret(result.secret);
      setConfirm(null);
      setNotice(
        action === 'save'
          ? 'Webhook saved.'
          : action === 'rotate'
            ? 'Signing secret rotated. Accept both keys during the 24-hour overlap.'
            : action === 'archive'
              ? 'Webhook archived.'
              : action === 'restore'
                ? 'Webhook restored and paused.'
                : 'Webhook status updated.',
      );
      await refresh();
    } catch (error) {
      if (!abort.signal.aborted)
        setNotice(
          (error as Error).message + ' Reload before retrying if the request outcome is uncertain.',
        );
    } finally {
      if (!abort.signal.aborted) setBusy(false);
    }
  };
  const reload = async () => {
    if (!current || busy) return;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    try {
      const value = await memberRedirectApi<RedirectWebhook>(
        '/webhooks/' + current.id,
        'GET',
        undefined,
        abort.signal,
      );
      if (abort.signal.aborted) return;
      setCurrent(value);
      setName(value.name);
      setUrl(value.url);
      setEvents(value.eventTypes);
      setLinkIds(value.linkIds?.join('\n') ?? '');
      setIncludeCustomerId(value.includeCustomerId);
      setSecret(null);
      setNotice('Current settings loaded.');
    } catch (error) {
      if (!abort.signal.aborted) {
        setSecret(null);
        setNotice((error as Error).message);
      }
    } finally {
      if (!abort.signal.aborted) setBusy(false);
    }
  };
  return (
    <div className="space-y-4 border-t pt-4">
      <div className="flex justify-between gap-2">
        <h4 className="font-medium">{current ? 'Manage webhook' : 'New webhook'}</h4>
        <Button variant="ghost" disabled={busy} onClick={close}>
          Close
        </Button>
      </div>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void act('save');
        }}
      >
        <fieldset disabled={busy || !!current?.deletedAt} className="space-y-4">
          <div>
            <Label htmlFor={formId + '-name'}>Name</Label>
            <Input
              id={formId + '-name'}
              value={name}
              maxLength={100}
              required
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor={formId + '-url'}>HTTPS endpoint</Label>
            <Input
              id={formId + '-url'}
              type="url"
              required
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://your-domain.com/webhooks"
            />
          </div>
          <fieldset>
            <legend className="text-sm font-medium">Event types</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {WEBHOOK_EVENTS.map((type) => (
                <label key={type} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={events.includes(type)}
                    onChange={(event) =>
                      setEvents((previous) =>
                        event.target.checked
                          ? [...previous, type]
                          : previous.filter((value) => value !== type),
                      )
                    }
                  />
                  {type}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <Label htmlFor={formId + '-links'}>Link IDs (optional)</Label>
            <textarea
              id={formId + '-links'}
              className="min-h-20 w-full rounded-element border bg-background p-2 text-sm"
              value={linkIds}
              onChange={(event) => setLinkIds(event.target.value)}
              aria-describedby={formId + '-links-help'}
            />
            <p id={formId + '-links-help'} className="text-xs text-muted-foreground">
              Leave empty for all managed links. Separate IDs with commas or new lines.
            </p>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeCustomerId}
              onChange={(event) => setIncludeCustomerId(event.target.checked)}
            />
            Include customer external IDs in conversion events
          </label>
          <p className="text-xs text-muted-foreground">
            Private customer names, email addresses, and destination parameters are excluded.
          </p>
          <Button type="submit" disabled={!events.length}>
            {busy ? 'Saving…' : 'Save webhook'}
          </Button>
        </fieldset>
      </form>
      {current && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy} onClick={() => void reload()}>
            Reload settings
          </Button>
          {current.deletedAt ? (
            <Button disabled={busy} onClick={() => void act('restore')}>
              Restore paused
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => (current.enabled ? setConfirm('pause') : void act('toggle'))}
              >
                {current.enabled ? 'Pause' : 'Resume'}
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => void act('test')}>
                Send test event
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => setConfirm('rotate')}>
                Rotate secret
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => setConfirm('archive')}>
                Archive
              </Button>
            </>
          )}
        </div>
      )}
      {confirm && (
        <div className="space-y-2" role="group" aria-label="Confirm webhook change">
          <p>
            {confirm === 'archive'
              ? 'Archive this webhook? Pending deliveries will be cancelled. A request already sent may still finish.'
              : confirm === 'pause'
                ? 'Pause this webhook? Pending deliveries will be cancelled. A request already sent may still finish.'
                : 'Replace the signing secret? The previous key stays valid for 24 hours.'}
          </p>
          <Button disabled={busy} onClick={() => void act(confirm)}>
            Confirm {confirm}
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => setConfirm(null)}>
            Cancel
          </Button>
        </div>
      )}
      {secret && (
        <div className="space-y-2 rounded-element border p-4">
          <p className="font-medium">Save this signing secret now</p>
          <p className="text-sm">It is shown once. Store it in your receiver’s secret manager.</p>
          <code className="block break-all text-xs">{secret}</code>
          <Button
            variant="outline"
            onClick={() =>
              void navigator.clipboard
                .writeText(secret)
                .then(() => setNotice('Signing secret copied.'))
                .catch(() => setNotice('Copy failed. Select the secret above.'))
            }
          >
            Copy secret
          </Button>
          <Button variant="ghost" onClick={() => setSecret(null)}>
            Dismiss secret
          </Button>
        </div>
      )}
      {notice && (
        <p role="status" className="text-sm break-words">
          {notice}
        </p>
      )}
      {current && <WebhookHistory key={current.id} account={account} webhook={current} />}
    </div>
  );
}
function WebhookHistory({ account, webhook }: { account: string; webhook: RedirectWebhook }) {
  const [cursor, setCursor] = useState<string | null>(null),
    [selected, setSelected] = useState<string | null>(null),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const base = '/webhooks/' + webhook.id + '/deliveries';
  const history = useQuery({
    queryKey: ['redirect-webhook-history', account, webhook.id, cursor],
    queryFn: ({ signal }) =>
      webhookPage<WebhookDelivery>(
        base + '?limit=50' + (cursor ? '&cursor=' + cursor : ''),
        signal,
      ),
    retry: false,
    gcTime: 0,
  });
  const detail = useQuery({
    queryKey: ['redirect-webhook-detail', account, webhook.id, selected],
    enabled: !!selected,
    queryFn: ({ signal }) =>
      memberRedirectApi<WebhookDelivery>(base + '/' + selected, 'GET', undefined, signal),
    retry: false,
    gcTime: 0,
  });
  const replay = async () => {
    if (!detail.data || busy) return;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    try {
      const result = await memberRedirectApi<{ retryAfter?: number }>(
        base + '/' + detail.data.id + '/replay',
        'POST',
        { version: detail.data.version },
        abort.signal,
      );
      if (abort.signal.aborted) return;
      setNotice(
        result.retryAfter
          ? 'Try again in ' + result.retryAfter + ' seconds.'
          : 'Delivery queued with the original event ID and body.',
      );
      await Promise.all([detail.refetch(), history.refetch()]);
    } catch (error) {
      if (!abort.signal.aborted) setNotice((error as Error).message);
    } finally {
      if (!abort.signal.aborted) setBusy(false);
    }
  };
  return (
    <section className="space-y-4 border-t pt-4" aria-label="Webhook delivery history">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-medium">Delivery history</h4>
        <Button
          variant="outline"
          onClick={() =>
            void Promise.all([history.refetch(), ...(selected ? [detail.refetch()] : [])])
          }
        >
          Refresh history
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Completed deliveries are retained for 30 days. Failed deliveries retry up to eight times.
      </p>
      {history.isPending && <p role="status">Loading deliveries…</p>}
      {history.isError && <p role="alert">{history.error.message}</p>}
      {!history.isError && history.data && (
        <>
          <ul className="divide-y">
            {history.data.data.map((row) => (
              <li key={row.id} className="flex flex-wrap justify-between gap-2 py-2">
                <div>
                  <p className="text-sm font-medium">
                    {row.eventType} · {row.state}
                  </p>
                  <p className="text-xs">
                    {new Date(row.createdAt).toLocaleString()} · {row.attempts} attempts
                    {row.httpStatus ? ' · HTTP ' + row.httpStatus : ''}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setSelected(row.id)}>
                  Inspect delivery
                </Button>
              </li>
            ))}
          </ul>
          {!history.data.data.length && <AdminEmpty noun="deliveries" variant="inline" />}
          <div className="flex gap-2">
            {cursor && (
              <Button variant="outline" onClick={() => setCursor(null)}>
                First page
              </Button>
            )}
            {history.data.nextCursor && (
              <Button variant="outline" onClick={() => setCursor(history.data.nextCursor)}>
                Older deliveries
              </Button>
            )}
          </div>
        </>
      )}
      {selected && (
        <div className="space-y-2">
          <Button variant="ghost" onClick={() => setSelected(null)}>
            Close receipt
          </Button>
          {detail.isPending && <p role="status">Loading receipt…</p>}
          {detail.isError && <p role="alert">{detail.error.message}</p>}
          {!detail.isError && detail.data && (
            <>
              <p className="text-sm">
                Event ID: <code className="break-all">{detail.data.eventId}</code>
              </p>
              <Label>Original request body</Label>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-element border p-2 text-xs">
                {detail.data.body}
              </pre>
              <Label>Receiver response</Label>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-element border p-2 text-xs">
                {detail.data.responseExcerpt || 'No response body recorded.'}
              </pre>
              <ol>
                {detail.data.recentAttempts?.map((attempt) => (
                  <li key={attempt.id} className="text-xs">
                    Attempt {attempt.number}:{' '}
                    {attempt.httpStatus
                      ? 'HTTP ' + attempt.httpStatus
                      : (attempt.errorCode ?? 'In progress')}
                    {attempt.durationMs !== null ? ' · ' + attempt.durationMs + ' ms' : ''}
                  </li>
                ))}
              </ol>
              {['delivered', 'failed', 'cancelled'].includes(detail.data.state) &&
                webhook.enabled &&
                !webhook.deletedAt && (
                  <>
                    <p className="text-sm">
                      Replay sends this exact payload again, including any customer ID originally
                      included. Ensure your receiver deduplicates the event ID.
                    </p>
                    <Button disabled={busy} onClick={() => void replay()}>
                      Replay this payload
                    </Button>
                  </>
                )}
            </>
          )}
          {notice && <p role="status">{notice}</p>}
        </div>
      )}
    </section>
  );
}
