import { useEffect, useId, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserRound } from '@/components/icons';
import { useAuth } from '@/hooks/useAuth';
import { useRedirectCustomerJourney } from '@/hooks/useRedirectConversions';
import {
  readCustomer,
  updateCustomer,
  clearCustomer,
  type CustomerProfileChanges,
} from '@/lib/redirects/customers';
import { amountMicros, formatRevenue } from '@/lib/redirects/conversions';
import { formatDateTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AdminEmpty } from '@/components/admin/primitives/AdminEmpty';
import { AdminTextSkeleton, AdminInlineSpinner } from '@/components/admin/primitives/AdminLoading';

function Avatar({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  return src && !failed ? (
    <img
      src={src}
      width={48}
      height={48}
      alt="Customer avatar"
      className="size-12 rounded-full object-cover"
      crossOrigin="anonymous"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  ) : (
    <UserRound aria-hidden className="size-12 shrink-0 text-muted-foreground" />
  );
}
export function RedirectCustomerDetails({
  customer,
  onClose,
}: {
  customer: string;
  onClose: () => void;
}) {
  const { user } = useAuth();
  return user ? (
    <CustomerDetails
      key={JSON.stringify([user.id, customer])}
      accountId={user.id}
      customer={customer}
      onClose={onClose}
    />
  ) : null;
}
function CustomerDetails({
  accountId,
  customer,
  onClose,
}: {
  accountId: string;
  customer: string;
  onClose: () => void;
}) {
  const id = useId(),
    client = useQueryClient(),
    queryKey = ['redirect-customer-profile', accountId, customer];
  const profile = useQuery({
    queryKey,
    queryFn: ({ signal }) => readCustomer(customer, signal),
    retry: false,
    gcTime: 0,
    staleTime: 0,
  });
  const journey = useRedirectCustomerJourney(customer);
  const [draft, setDraft] = useState<(CustomerProfileChanges & { mode: 'edit' | 'clear' }) | null>(
    null,
  );
  const [notice, setNotice] = useState('');
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const save = useMutation({
    mutationFn: (value: NonNullable<typeof draft>) =>
      value.mode === 'clear'
        ? clearCustomer(customer, value.version)
        : updateCustomer(customer, {
            version: value.version,
            name: value.name,
            email: value.email,
            avatarUrl: value.avatarUrl,
          }),
    onSuccess: async (data) => {
      await client.cancelQueries({ queryKey, exact: true });
      if (!alive.current) return;
      client.setQueryData(queryKey, data);
      setDraft(null);
      setNotice('Customer identity saved.');
    },
  });
  const current = profile.isSuccess && !profile.isFetching ? profile.data : undefined;
  const busy = save.isPending || profile.isFetching || !current?.canEdit;
  const edit = () => {
    if (!current) return;
    setDraft({
      mode: 'edit',
      version: current.version,
      name: current.name ?? '',
      email: current.email ?? '',
      avatarUrl: current.avatarUrl ?? '',
    });
    setNotice('');
    save.reset();
  };
  const discard = () => {
    setDraft(null);
    setNotice('');
    save.reset();
  };
  return (
    <section aria-label="Customer journey" className="min-w-0 space-y-4 border-t pt-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="break-all font-medium">Journey: {customer}</h4>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close journey
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Private customer identity and recorded clicks, leads and sales across your accessible links.
        Public dashboards never include this profile.
      </p>
      {profile.isPending || profile.isFetching ? (
        <AdminTextSkeleton lines={2} />
      ) : profile.isError ? (
        <div className="space-y-2">
          <p role="alert">{profile.error.message}</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              discard();
              void profile.refetch();
            }}
          >
            Retry customer profile
          </Button>
        </div>
      ) : (
        current && (
          <>
            <div className="flex items-center gap-4">
              <Avatar key={current.avatarUrl} src={current.avatarUrl} />
              <div className="min-w-0 space-y-1">
                <p className="break-words font-medium">{current.name ?? customer}</p>
                {current.email ? (
                  <a
                    className="break-all text-sm underline underline-offset-4"
                    href={'mailto:' + current.email}
                  >
                    {current.email}
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">No email supplied</span>
                )}
              </div>
            </div>
            {!draft && current.canEdit && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={edit}>
                  Edit customer identity
                </Button>
                {(current.name || current.email || current.avatarUrl) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setDraft({ mode: 'clear', version: current.version });
                      setNotice('');
                      save.reset();
                    }}
                  >
                    Clear customer identity
                  </Button>
                )}
              </div>
            )}
            {!current.canEdit && (
              <p className="text-xs text-muted-foreground">
                Edit access to all of this customer’s links is required to change their shared
                identity.
              </p>
            )}
          </>
        )
      )}
      {draft && current && (
        <div className="space-y-4">
          {draft.mode === 'edit' ? (
            <fieldset disabled={busy} className="space-y-4">
              <label htmlFor={id + '-name'} className="block space-y-1 text-sm">
                Customer name
                <Input
                  id={id + '-name'}
                  value={draft.name ?? ''}
                  maxLength={120}
                  autoComplete="off"
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </label>
              <label htmlFor={id + '-email'} className="block space-y-1 text-sm">
                Customer email
                <Input
                  id={id + '-email'}
                  type="email"
                  value={draft.email ?? ''}
                  maxLength={254}
                  autoComplete="off"
                  onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                />
              </label>
              <label htmlFor={id + '-avatar'} className="block space-y-1 text-sm">
                Customer avatar URL
                <Input
                  id={id + '-avatar'}
                  type="url"
                  value={draft.avatarUrl ?? ''}
                  maxLength={2048}
                  autoComplete="off"
                  onChange={(e) => setDraft({ ...draft, avatarUrl: e.target.value })}
                />
              </label>
              <p className="text-xs text-muted-foreground">
                Use an HTTPS avatar. Supply identity you have permission to keep for customer
                insights.
              </p>
            </fieldset>
          ) : (
            <p>
              Clear the name, email and avatar? Recorded customer events and attribution stay
              available.
            </p>
          )}
          {save.isError && (
            <p role="alert" className="text-sm text-destructive">
              {save.error.message} Discard and reload before trying again.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy || save.isError}
              variant={draft.mode === 'clear' ? 'destructive' : 'default'}
              onClick={() => save.mutate(draft)}
            >
              {save.isPending
                ? 'Saving identity…'
                : draft.mode === 'clear'
                  ? 'Confirm clear identity'
                  : 'Save customer identity'}
            </Button>
            <Button variant="ghost" disabled={save.isPending} onClick={discard}>
              Discard identity change
            </Button>
            {save.isError && (
              <Button
                variant="outline"
                onClick={() => {
                  discard();
                  void profile.refetch();
                }}
              >
                Reload customer identity
              </Button>
            )}
          </div>
        </div>
      )}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {journey.isPending && <AdminTextSkeleton lines={3} />}
      {journey.isError && (
        <div className="space-y-2">
          <p role="alert">{journey.error.message}</p>
          <Button size="sm" variant="outline" onClick={() => void journey.refetch()}>
            Retry journey
          </Button>
        </div>
      )}
      {journey.isSuccess && (
        <>
          <ol className="divide-y">
            {journey.data.pages
              .flatMap((page) => page.data)
              .map((event) => (
                <li key={event.id} className="space-y-1 py-4 text-sm">
                  <p>
                    {formatDateTime(event.occurred_at)} · {event.event_name} ({event.kind})
                  </p>
                  <p className="break-words text-xs text-muted-foreground">
                    {event.source ?? 'Unknown source'}
                    {event.amount !== null && event.currency
                      ? ' · ' + formatRevenue(amountMicros(event.amount), event.currency)
                      : ''}
                  </p>
                </li>
              ))}
          </ol>
          {journey.data.pages.every((page) => page.data.length === 0) && (
            <AdminEmpty noun="recorded journey events" variant="inline" />
          )}
          {journey.hasNextPage && (
            <Button
              variant="outline"
              size="sm"
              disabled={journey.isFetchingNextPage}
              onClick={() => void journey.fetchNextPage()}
            >
              {journey.isFetchingNextPage ? (
                <AdminInlineSpinner label="Loading journey" />
              ) : (
                'Load more journey events'
              )}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
