import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { memberRedirectApi } from '@/lib/redirects/memberApi';
interface SetupDomain {
  id: string;
  hostname: string;
  version: string;
  ownershipVerified: boolean;
  verification: { type: string; name: string; value: string };
}
export interface DomainConnectOperation {
  id: string;
  state: string;
  expiresAt: string;
  domain: SetupDomain;
  outcome: 'verified' | 'missing' | 'unavailable' | null;
  discovery?: { provider?: 'cloudflare' | 'vercel'; reason?: string };
  approvalUrl?: string;
}
type SetupApi = (
  path: string,
  method: 'GET' | 'POST',
  body?: Record<string, unknown>,
  signal?: AbortSignal,
) => Promise<DomainConnectOperation>;
const requestSetup: SetupApi = (path, method, body, signal) =>
  memberRedirectApi<DomainConnectOperation>(path, method, body, signal);
const navigateToProvider = (url: string) => window.location.assign(url);
function approvalDestination(value: string | undefined, provider: string | undefined) {
  if (!value) throw new Error('Provider approval is unavailable. Start DNS setup again.');
  const url = new URL(value),
    expected =
      provider === 'cloudflare'
        ? 'https://dash.cloudflare.com'
        : provider === 'vercel'
          ? 'https://vercel.com'
          : '';
  if (
    !expected ||
    url.origin !== expected ||
    url.username ||
    url.password ||
    !url.pathname.endsWith('/v2/domainTemplates/providers/queer.guide/services/redirects/apply')
  )
    throw new Error('Provider approval is unavailable. Start DNS setup again.');
  return url.href;
}
export function RedirectDomainConnect({
  domain,
  configured,
  cnameTarget,
  disabled,
  api = requestSetup,
  navigate = navigateToProvider,
}: {
  domain: SetupDomain;
  configured: boolean;
  cnameTarget: string | null;
  disabled: boolean;
  api?: SetupApi;
  navigate?: (url: string) => void;
}) {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [operation, setOperation] = useState<DomainConnectOperation | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const mutation = useMutation({
    mutationFn: async (action: 'discover' | 'approve') => {
      const result = await api('/domains/' + domain.id + '/dns-setup/' + action, 'POST', {
        version: domain.version,
        ...(action === 'approve' ? { operation: operation!.id } : {}),
      });
      if (!mounted.current) return result;
      if (action === 'approve')
        navigate(approvalDestination(result.approvalUrl, operation?.discovery?.provider));
      return result;
    },
    onSuccess: (result) => {
      setOperation(result);
      setReviewed(false);
    },
  });
  const provider =
    operation?.discovery?.provider === 'cloudflare'
      ? 'Cloudflare'
      : operation?.discovery?.provider === 'vercel'
        ? 'Vercel'
        : null;
  return (
    <section
      aria-label={'Automatic DNS setup for ' + domain.hostname}
      className="space-y-4 border-t pt-4"
    >
      <h4 className="font-semibold">Automatic DNS setup</h4>
      {!configured || !cnameTarget ? (
        <p className="text-sm text-muted-foreground">
          Automatic setup is not enabled for this workspace. Use the manual DNS instructions below.
        </p>
      ) : (
        <>
          <p className="text-sm">
            Cloudflare and Vercel can add the short-link records after you review them and approve
            the changes in your DNS account.
          </p>
          {disabled && (
            <p className="text-sm">
              Enable and restore this domain before starting automatic setup.
            </p>
          )}
          {mutation.error && (
            <p role="alert" className="break-words text-sm text-destructive">
              {mutation.error.message}
            </p>
          )}
          {mutation.isPending && (
            <p role="status" className="text-sm">
              {mutation.variables === 'discover'
                ? 'Checking your DNS provider…'
                : 'Preparing provider approval…'}
            </p>
          )}
          {operation?.state === 'review' && provider ? (
            <div className="space-y-4">
              <p className="text-sm font-medium">Review the records for {domain.hostname}</p>
              <p className="text-sm">
                Your DNS provider may replace conflicting records at these names. Keep the TXT
                record for future ownership checks.
              </p>
              <dl className="space-y-2 text-sm">
                <dt className="break-all font-medium">CNAME · {domain.hostname}</dt>
                <dd className="break-all">{cnameTarget.replace(/\.$/, '')}.</dd>
                <dt className="break-all font-medium">TXT · {domain.verification.name}</dt>
                <dd className="break-all">{domain.verification.value}</dd>
              </dl>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={reviewed}
                  disabled={mutation.isPending}
                  onChange={(event) => setReviewed(event.target.checked)}
                />
                I reviewed these DNS records.
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={!reviewed || disabled || mutation.isPending}
                  onClick={() => mutation.mutate('approve')}
                >
                  Continue to {provider}
                </Button>
                <Button
                  variant="ghost"
                  disabled={mutation.isPending}
                  onClick={() => {
                    setOperation(null);
                    setReviewed(false);
                    mutation.reset();
                  }}
                >
                  Cancel DNS setup
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                You will return here to check ownership. Certificate and branded routing checks
                follow separately.
              </p>
            </div>
          ) : (
            <>
              {operation?.state === 'unsupported' && (
                <p role="status" className="text-sm">
                  {operation.discovery?.reason === 'apex_not_supported'
                    ? 'Automatic setup supports subdomains. Add this domain’s records manually.'
                    : 'Automatic setup is not supported for this domain yet. Use the manual DNS instructions below.'}
                </p>
              )}
              {operation?.state === 'unavailable' && (
                <p role="status" className="text-sm">
                  Your DNS provider could not be checked. Try again later or use the manual
                  instructions below.
                </p>
              )}
              {operation?.state === 'approved' && (
                <p role="status" className="text-sm">
                  Opening your DNS provider for approval…
                </p>
              )}
              <Button
                variant="outline"
                disabled={disabled || mutation.isPending}
                onClick={() => {
                  setReviewed(false);
                  mutation.mutate('discover');
                }}
              >
                Check automatic setup
              </Button>
            </>
          )}
        </>
      )}
    </section>
  );
}

export function RedirectDomainConnectReturn({
  accountId,
  onChanged,
  api = requestSetup,
}: {
  api?: SetupApi;
  accountId: string;
  onChanged: () => Promise<unknown>;
}) {
  const [operationId, setOperationId] = useState(() =>
    new URLSearchParams(window.location.search).get('domain_connect'),
  );
  function dismiss() {
    const url = new URL(window.location.href);
    url.searchParams.delete('domain_connect');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    setOperationId(null);
  }
  if (!operationId) return null;
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(operationId))
    return (
      <div className="space-y-2">
        <p role="alert">This DNS setup link is invalid. Start again from the domain settings.</p>
        <Button variant="ghost" onClick={dismiss}>
          Dismiss DNS setup
        </Button>
      </div>
    );
  return (
    <ReturnedSetup
      key={accountId + operationId}
      operationId={operationId}
      accountId={accountId}
      onChanged={onChanged}
      api={api}
      dismiss={dismiss}
    />
  );
}
function ReturnedSetup({
  operationId,
  accountId,
  onChanged,
  dismiss,
  api,
}: {
  api: SetupApi;
  operationId: string;
  accountId: string;
  onChanged: () => Promise<unknown>;
  dismiss: () => void;
}) {
  const client = useQueryClient(),
    queryKey = ['redirect-dns-return', accountId, operationId];
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => api('/domain-connect/' + operationId, 'GET', undefined, signal),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const complete = useMutation({
    mutationFn: () =>
      api('/domains/' + query.data!.domain.id + '/dns-setup/complete', 'POST', {
        version: query.data!.domain.version,
        operation: operationId,
      }),
    onSuccess: async (result) => {
      client.setQueryData(queryKey, result);
      await onChanged();
    },
  });
  const operation = query.data;
  return (
    <section aria-label="DNS setup return" className="space-y-4 border-t pt-4">
      <h4 className="font-semibold">Check DNS after provider approval</h4>
      {query.isPending && (
        <p role="status" className="text-sm">
          Loading your DNS setup…
        </p>
      )}
      {(query.error || complete.error) && (
        <p role="alert" className="break-words text-sm text-destructive">
          {(query.error || complete.error)!.message}
        </p>
      )}
      {operation && (
        <>
          <p className="break-all text-sm">{operation.domain.hostname}</p>
          {operation.state === 'approved' && (
            <>
              <p className="text-sm">
                Returning from your provider does not confirm that records were saved. Check the TXT
                record to confirm ownership.
              </p>
              <Button disabled={complete.isPending} onClick={() => complete.mutate()}>
                {complete.isPending ? 'Checking DNS…' : 'Check updated DNS records'}
              </Button>
            </>
          )}
          {operation.state === 'complete' && (
            <p role="status" className="text-sm">
              {operation.outcome === 'verified'
                ? 'Ownership confirmed. Continue with the certificate and branded routing checks below.'
                : operation.outcome === 'missing'
                  ? 'The TXT record is not visible yet. Allow time for DNS to update, then use Check DNS ownership in the domain settings.'
                  : 'DNS could not be checked. Try Check DNS ownership in the domain settings later.'}
            </p>
          )}
          {!['approved', 'complete'].includes(operation.state) && (
            <p className="text-sm">
              This setup has not completed provider approval. Start again from the domain settings.
            </p>
          )}
        </>
      )}
      <Button variant="ghost" disabled={complete.isPending} onClick={dismiss}>
        Dismiss DNS setup
      </Button>
    </section>
  );
}
