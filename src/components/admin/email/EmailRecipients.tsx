import { useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { recipientKinds } from './audienceRules';
type Kind = (typeof recipientKinds)[number];
const names: Record<Kind, string> = {
  organization: 'Organisations',
  venue: 'Venues',
  vendor: 'Vendors',
  user: 'Users',
};
interface Recipient {
  kind: Kind;
  id: string;
  label: string;
  email: string;
  evidence: string;
  subscriber_id: string | null;
  subscription_status: string | null;
  topics: string[] | null;
  eligibility: string;
}
export function EmailRecipients({ onImported }: { onImported: () => void }) {
  const [kind, setKind] = useState<Kind>('organization');
  const [page, setPage] = useState<{ recipients: Recipient[]; next: string | null } | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [history, setHistory] = useState<(string | null)[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const request = useRef(0);
  async function load(after: string | null): Promise<boolean> {
    const sequence = ++request.current;
    setBusy(true);
    setError(null);
    try {
      const r = await supabase.functions.invoke(
        `email-admin?resource=recipients&kind=${kind}${after ? `&after=${after}` : ''}`,
        { method: 'GET' },
      );
      if (sequence !== request.current) return false;
      if (r.error || !Array.isArray(r.data?.recipients)) throw new Error('directory');
      setPage(r.data);
      setCursor(after);
      return true;
    } catch {
      if (sequence === request.current)
        setError('The recipient directory could not load. Retry this page.');
      return false;
    } finally {
      if (sequence === request.current) setBusy(false);
    }
  }
  async function add(recipient: Recipient) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await supabase.functions.invoke('email-admin', {
        body: { action: 'recipient-import', kind: recipient.kind, id: recipient.id },
      });
      if (r.error) throw new Error('import');
      setNotice(
        r.data.inserted_pending > 0
          ? 'Pending contact added with its entity reference. No consent was granted and no mail was sent.'
          : 'No contact added: this mailbox already exists, is suppressed, or was erased. No mail was sent.',
      );
      await load(cursor);
      onImported();
    } catch {
      setError('Could not add this contact. Reload the directory before retrying.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4 border-t border-border pt-6" aria-label="Entity recipients">
      <h2 className="font-sans text-title font-bold">Organisations, venues, vendors and users</h2>
      <p className="max-w-prose text-sm text-muted-foreground">
        Browse current listing contacts and verified account mailboxes. Vendors use linked
        organisation contacts or current marketplace listing contacts. Published addresses establish
        a contact source; they do not establish ownership or subscription consent. Shared addresses
        use one subscription and suppression record.
      </p>
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 space-y-2 sm:flex-1 sm:max-w-xs">
          <Label htmlFor="email-recipient-kind">Recipient type</Label>
          <select
            id="email-recipient-kind"
            className="min-h-10 w-full rounded-element border border-input bg-background px-4 text-sm"
            value={kind}
            disabled={busy}
            onChange={(e) => {
              ++request.current;
              setKind(e.target.value as Kind);
              setPage(null);
              setCursor(null);
              setHistory([]);
              setError(null);
              setNotice(null);
            }}
          >
            {recipientKinds.map((k) => (
              <option key={k} value={k}>
                {names[k]}
              </option>
            ))}
          </select>
        </div>
        <Button variant="outline" disabled={busy} onClick={() => void load(cursor)}>
          {busy ? 'Loading recipients…' : page ? 'Refresh recipients' : 'Browse recipients'}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {page && (
        <>
          {!page.recipients.length && (
            <p className="text-sm text-muted-foreground">
              No current contacts on this page. Archived, unavailable and erased contacts are
              excluded.
            </p>
          )}
          <ul className="divide-y divide-border" aria-label={`${names[kind]} recipients`}>
            {page.recipients.map((r) => (
              <li
                key={r.id}
                className="flex min-w-0 flex-col items-start justify-between gap-4 py-4 sm:flex-row"
              >
                <div className="min-w-0 space-y-2 sm:flex-1">
                  <p className="break-words font-medium">{r.label}</p>
                  <p className="break-all text-sm">{r.email}</p>
                  <p className="text-sm text-muted-foreground">
                    {r.evidence === 'verified_account_mailbox'
                      ? 'Verified account mailbox'
                      : r.evidence === 'linked_organization_contact'
                        ? 'Linked organisation contact'
                        : 'Published listing contact'}{' '}
                    · {r.eligibility.replaceAll('_', ' ')}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Topics: {r.topics?.length ? r.topics.join(', ').replaceAll('_', ' ') : 'none'}
                  </p>
                </div>
                {!r.subscriber_id && r.eligibility === 'no_subscription' && (
                  <Button
                    variant="outline"
                    disabled={busy}
                    aria-label={`Add pending contact for ${r.label}`}
                    onClick={() => void add(r)}
                  >
                    Add pending contact
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={busy || !history.length}
              onClick={async () => {
                if (await load(history.at(-1) ?? null)) setHistory((h) => h.slice(0, -1));
              }}
            >
              Previous recipients
            </Button>
            <Button
              variant="outline"
              disabled={busy || !page.next}
              onClick={async () => {
                if (page.next && (await load(page.next))) setHistory((h) => [...h, cursor]);
              }}
            >
              Next recipients
            </Button>
          </div>
        </>
      )}
      <p className="max-w-prose text-sm text-muted-foreground">
        Use Recipient type in Audiences to combine these contacts with language, topics and other
        rules. Only confirmed subscriptions qualify for marketing audiences. Cloudflare currently
        blocks marketing and newsletter delivery; transactional messages require their existing
        service event.
      </p>
    </section>
  );
}
