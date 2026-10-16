import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { memberRedirectApi, RedirectApiError } from '@/lib/redirects/memberApi';
export interface InstructionMail {
  id: string;
  requestId: string;
  domainId: string;
  domainVersion: string;
  email: string;
  state: 'queued' | 'leased' | 'sent' | 'failed' | 'cancelled' | 'uncertain';
  canCancel: boolean;
  error?: string | null;
}
export interface InstructionDraft {
  hostname: string;
  version: string;
  snapshot: string;
  records: { type: string; name: string; value: string }[];
  latestMail: InstructionMail | null;
}
type Submission = { version: string; snapshot: string; email: string; requestId: string };
type Saved = { body: Submission; receipt: InstructionMail | null };
export type InstructionApi = <T>(
  path: string,
  method?: 'GET' | 'POST',
  body?: Record<string, unknown>,
) => Promise<T>;
const stateText: Record<InstructionMail['state'], string> = {
  queued: 'Queued for sending. Refresh to check progress.',
  leased: 'Sending has started. This email cannot be recalled.',
  sent: 'Email accepted by the mail provider. Inbox delivery is not confirmed.',
  failed: 'The email was not accepted. Review the error before starting again.',
  cancelled: 'Email cancelled before sending.',
  uncertain:
    'This email may already have been sent. Check with the recipient before sending another.',
};
function loadSaved(key: string): Saved | null {
  const raw = sessionStorage.getItem(key);
  if (!raw) return null;
  const value = JSON.parse(raw) as Saved;
  if (
    !value?.body ||
    typeof value.body.requestId !== 'string' ||
    typeof value.body.version !== 'string' ||
    typeof value.body.snapshot !== 'string' ||
    typeof value.body.email !== 'string'
  )
    throw new Error(
      'Saved email request could not be read. Keep this tab open and contact support before sending again.',
    );
  return value;
}
export function RedirectDomainMail({
  accountId,
  domain,
  configured,
  api = memberRedirectApi,
}: {
  accountId: string;
  domain: { id: string; hostname: string; version: string; disabled: boolean; archived: boolean };
  configured: boolean;
  api?: InstructionApi;
}) {
  // Keying the inner view also isolates late responses when an account/domain changes.
  return (
    <MailForm
      key={accountId + ':' + domain.id + ':' + domain.version}
      accountId={accountId}
      domain={domain}
      configured={configured}
      api={api}
    />
  );
}
function MailForm({
  accountId,
  domain,
  configured,
  api,
}: Parameters<typeof RedirectDomainMail>[0]) {
  const storageKey = 'redirect-dns-email:v1:' + accountId + ':' + domain.id;
  const [initial] = useState(() => {
    try {
      return { saved: loadSaved(storageKey), error: '' };
    } catch (error) {
      return { saved: null, error: (error as Error).message };
    }
  });
  const [saved, setSaved] = useState<Saved | null>(initial.saved);
  const [receipt, setReceipt] = useState<InstructionMail | null>(initial.saved?.receipt ?? null);
  const [draft, setDraft] = useState<InstructionDraft | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initial.error);
  const [notice, setNotice] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const path = '/domains/' + domain.id;
  const available = configured && !domain.disabled && !domain.archived;
  function persist(next: Saved) {
    sessionStorage.setItem(storageKey, JSON.stringify(next));
    if (mounted.current) setSaved(next);
  }
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (failure) {
      if (mounted.current)
        setError(
          (failure as Error).message ||
            'Request failed. Refresh the email status before trying again.',
        );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  function remember(result: InstructionMail, body = saved?.body) {
    if (!mounted.current) return;
    if (body) persist({ body, receipt: result });
    setReceipt(result);
  }
  async function recover() {
    if (saved) {
      const result = await api!<{ mail: InstructionMail | null }>(
        path + '/instruction-emails?requestId=' + encodeURIComponent(saved.body.requestId),
      );
      if (!mounted.current) return;
      if (result.mail) remember(result.mail);
      else
        setNotice(
          'No receipt is available yet. The original request may still finish. Retry the same request to recover its result.',
        );
    } else if (receipt) {
      remember(await api!<InstructionMail>(path + '/instruction-emails/' + receipt.id));
    } else {
      const result = await api!<{ mail: InstructionMail | null }>(path + '/instruction-emails');
      if (!mounted.current) return;
      if (result.mail) setReceipt(result.mail);
      else setNotice('No previous instruction email was found for your account on this domain.');
    }
  }
  async function review(previousReceiptId?: string) {
    const result = await api!<InstructionDraft>(path + '/instructions');
    if (!mounted.current) return;
    if (result.version !== domain.version)
      throw new Error('Domain settings changed. Refresh domains before reviewing the email.');
    setDraft(result);
    if (result.latestMail && result.latestMail.id !== previousReceiptId)
      setReceipt(result.latestMail);
  }
  async function send() {
    const body: Submission = saved?.body ?? {
      version: draft!.version,
      snapshot: draft!.snapshot,
      email: email.trim(),
      requestId: crypto.randomUUID(),
    };
    // Persist first. A lost response, reload, or role change must reuse this exact request.
    persist({ body, receipt: saved?.receipt ?? null });
    try {
      const result = await api!<InstructionMail>(path + '/instructions', 'POST', body);
      remember(result, body);
    } catch (failure) {
      // These statuses precede queue insertion in this endpoint. Only a first,
      // observed response can unlock editing; a retry may follow an accepted send.
      if (
        !saved &&
        failure instanceof RedirectApiError &&
        [400, 409, 429].includes(failure.status ?? 0) &&
        mounted.current
      ) {
        sessionStorage.removeItem(storageKey);
        setSaved(null);
        if (failure.status === 409) setDraft(null);
      }
      throw failure;
    }
  }
  async function startAgain() {
    if (saved && !receipt) {
      // A null lookup is insufficient: a different version also makes the old queue request invalid.
      const result = await api!<{ mail: InstructionMail | null }>(
        path + '/instruction-emails?requestId=' + encodeURIComponent(saved.body.requestId),
      );
      if (!mounted.current) return;
      if (result.mail) {
        remember(result.mail);
        return;
      }
      const fresh = await api!<InstructionDraft>(path + '/instructions');
      if (!mounted.current) return;
      if (fresh.version === saved.body.version)
        throw new Error(
          'The original request is still unresolved. Retry the same request or refresh its status.',
        );
      if (fresh.version !== domain.version)
        throw new Error('Refresh domains to load the current settings.');
    }
    if (!mounted.current) return;
    sessionStorage.removeItem(storageKey);
    setSaved(null);
    setReceipt(null);
    setDraft(null);
    setAcknowledged(false);
    await review(receipt?.id);
  }
  const terminal = receipt && !['queued', 'leased'].includes(receipt.state);
  const needsAcknowledgement = receipt?.state === 'sent' || receipt?.state === 'uncertain';
  return (
    <section
      aria-label={'Email DNS instructions for ' + domain.hostname}
      className="min-w-0 space-y-4 border-t pt-4"
    >
      <h4 className="font-semibold">Email DNS instructions</h4>
      <p className="text-sm">
        Send the exact DNS records to the person who manages this domain. Sending instructions does
        not verify ownership, TLS or branded routing.
      </p>
      {!available && (
        <p className="text-sm text-muted-foreground">
          {!configured
            ? 'Email sending is not enabled for this workspace. You can copy the DNS instructions manually.'
            : 'Restore and enable this domain before preparing a new email.'}{' '}
          Existing requests can still be checked below.
        </p>
      )}
      {error && (
        <p role="alert" className="break-words text-sm">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {saved && !receipt && (
        <div className="space-y-2 text-sm">
          <p role="status">
            The send result is unresolved. It may already have been accepted. Keep this request
            identity when retrying.
          </p>
          <p className="break-all">Recipient: {saved.body.email}</p>
        </div>
      )}
      {receipt && (
        <div className="space-y-2 text-sm" role="status">
          <p className="break-all">Recipient: {receipt.email}</p>
          <p>{stateText[receipt.state]}</p>
          {receipt.error && <p className="break-words">{receipt.error}</p>}
        </div>
      )}
      {(saved || receipt || !draft) && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy || !!initial.error}
            onClick={() => void run(recover)}
          >
            {saved || receipt ? 'Refresh email status' : 'Check previous email status'}
          </Button>
          {saved && !receipt && (
            <Button
              type="button"
              variant="outline"
              disabled={busy || !!initial.error}
              onClick={() => void run(send)}
            >
              Retry same email request
            </Button>
          )}
          {receipt?.canCancel && (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(async () =>
                  remember(
                    await api!<InstructionMail>(
                      path + '/instruction-emails/' + receipt.id + '/cancel',
                      'POST',
                      {},
                    ),
                  ),
                )
              }
            >
              Cancel unsent email
            </Button>
          )}
        </div>
      )}
      {available && !saved && !receipt && !draft && (
        <Button
          type="button"
          variant="outline"
          disabled={busy || !!initial.error}
          onClick={() => void run(review)}
        >
          Review email instructions
        </Button>
      )}
      {available && (terminal || (saved && !receipt && saved.body.version !== domain.version)) && (
        <div className="space-y-4">
          {needsAcknowledgement && (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
              />
              I checked with the recipient and want to prepare another email.
            </label>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={busy || (needsAcknowledgement && !acknowledged) || !!initial.error}
            onClick={() => void run(startAgain)}
          >
            Prepare another email
          </Button>
        </div>
      )}
      {draft && !saved && !receipt && available && (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void run(send);
          }}
        >
          <p className="break-all text-sm">
            Records for {draft.hostname}. Review these names and values before sending.
          </p>
          {draft.records.map((record, index) => (
            <dl key={index} className="space-y-2 text-sm">
              <dt className="font-medium">{record.type} name</dt>
              <dd className="break-all">{record.name}</dd>
              <dt className="font-medium">Value</dt>
              <dd className="break-all">{record.value}</dd>
            </dl>
          ))}
          <p className="text-sm text-muted-foreground">
            These records are a snapshot. DNS changes may require refreshed instructions. Check for
            conflicting records with your DNS provider before saving.
          </p>
          <div className="space-y-2">
            <Label htmlFor={'dns-email-' + domain.id}>Recipient email</Label>
            <Input
              id={'dns-email-' + domain.id}
              type="text"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              required
              maxLength={254}
              value={email}
              disabled={busy}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || !email.trim()}>
              Email these DNS records
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void run(review)}
            >
              Reload records
            </Button>
          </div>
        </form>
      )}
      {busy && (
        <p role="status" className="text-sm">
          Checking email request…
        </p>
      )}
    </section>
  );
}
