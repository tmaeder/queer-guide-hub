import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmailRecipients } from './EmailRecipients';
import { parseContactImport } from './contactImport';
import { exportEmailContacts } from '@/lib/emailContactExport';
interface Contact {
  id: string;
  email: string;
  status: string;
  topics: string[];
  locale: string;
  source: string;
  confirmed_at: string | null;
}
export function EmailContacts() {
  const [contacts, setContacts] = useState<Contact[]>([]),
    [after, setAfter] = useState<string | null>(null),
    [next, setNext] = useState<string | null>(null),
    [pages, setPages] = useState<(string | null)[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const [source, setSource] = useState(''),
    [reference, setReference] = useState(''),
    [rows, setRows] = useState<{ email: string; locale: string }[] | null>(null),
    [importError, setImportError] = useState<string | null>(null),
    [notice, setNotice] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<{
    email: string;
    events: {
      id?: string;
      kind?: string;
      action?: string;
      occurred_at?: string;
      created_at?: string;
      source?: string;
    }[];
  } | null>(null);
  const request = useRef(0),
    trace = useRef(0),
    fileRequest = useRef(0),
    fileInput = useRef<HTMLInputElement>(null);
  async function load(cursor: string | null) {
    const sequence = ++request.current;
    setLoading(true);
    setError(null);
    ++trace.current;
    setTimeline(null);
    try {
      const r = await supabase.functions.invoke(
        `email-admin?resource=contacts${cursor ? `&after=${cursor}` : ''}`,
        { method: 'GET' },
      );
      if (sequence !== request.current) return;
      if (r.error || !Array.isArray(r.data?.contacts)) throw new Error('contacts');
      setContacts(r.data.contacts);
      setNext(r.data.next);
      setAfter(cursor);
      return true;
    } catch {
      if (sequence === request.current)
        setError('Contacts could not load. Retry this page before relying on the list.');
      return false;
    } finally {
      if (sequence === request.current) setLoading(false);
    }
  }
  useEffect(() => {
    const current = request,
      pending = trace;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Load the first remote contact page on mount.
    void load(null);
    return () => {
      ++current.current;
      ++pending.current;
    };
  }, []);
  async function readFile(file: File | undefined) {
    const sequence = ++fileRequest.current;
    setRows(null);
    setImportError(null);
    setNotice(null);
    if (!file) return;
    try {
      if (file.size > 100000) throw new Error('Import files must be at most 100 KB.');
      const parsed = parseContactImport(await file.text());
      if (sequence === fileRequest.current) setRows(parsed);
    } catch (error) {
      if (sequence === fileRequest.current)
        setImportError(error instanceof Error ? error.message : 'Could not read this CSV.');
    }
  }
  async function importRows(e: React.FormEvent) {
    e.preventDefault();
    if (!rows || busy) return;
    setBusy(true);
    setNotice(null);
    setImportError(null);
    try {
      const r = await supabase.functions.invoke('email-admin', {
        body: {
          action: 'contact-import',
          source: source.trim(),
          reference: reference.trim(),
          rows,
        },
      });
      if (r.error)
        throw new Error(
          'Import result unavailable. Reload contacts before retrying; replay will skip existing addresses.',
        );
      setNotice(
        `${r.data.inserted_pending} pending contacts added; ${r.data.skipped} existing, suppressed, erased or repeated addresses skipped. No consent was granted and no email was queued.`,
      );
      setRows(null);
      if (fileInput.current) fileInput.current.value = '';
      await load(null);
      setPages([]);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Import failed.');
    } finally {
      setBusy(false);
    }
  }
  async function exportAll(format: 'Excel' | 'CSV') {
    setBusy(true);
    setError(null);
    try {
      await exportEmailContacts(format);
    } catch {
      setError('All contacts could not be exported. Retry when available.');
    } finally {
      setBusy(false);
    }
  }
  async function inspect(contact: Contact) {
    const sequence = ++trace.current;
    setTimeline(null);
    setError(null);
    try {
      const r = await supabase.functions.invoke(`email-admin?resource=timeline&id=${contact.id}`, {
        method: 'GET',
      });
      if (sequence !== trace.current) return;
      if (r.error || !Array.isArray(r.data?.events)) throw new Error('timeline');
      setTimeline({ email: contact.email, events: r.data.events });
    } catch {
      if (sequence === trace.current) setError('Contact history could not load.');
    }
  }
  return (
    <section className="space-y-8 py-6" aria-label="Subscriber operations">
      <EmailRecipients
        onImported={() => {
          void load(after);
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-sans text-title font-bold">Subscriptions and provenance</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={loading || busy} onClick={() => void load(after)}>
            Refresh contacts
          </Button>
          {(['Excel', 'CSV'] as const).map((format) => (
            <Button
              key={format}
              variant="outline"
              disabled={loading || busy}
              onClick={() => void exportAll(format)}
            >
              Export all contacts ({format})
            </Button>
          ))}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Up to 100 contacts per page, ordered by immutable contact ID. Exports include subscription
        state and provenance. Pending contacts have no confirmed consent. Export files contain
        personal data; store them privately.
      </p>
      {error && <p role="alert">{error}</p>}
      {loading ? (
        <p role="status">Loading contacts…</p>
      ) : !contacts.length ? (
        <p className="text-sm">No contacts on this page.</p>
      ) : (
        <ul className="divide-y divide-border">
          {contacts.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
              <div className="min-w-0 space-y-2">
                <p className="break-all font-semibold">{c.email}</p>
                <p className="text-sm">
                  {c.status} · {c.locale} · {c.topics.join(', ') || 'No subscribed topics'}
                </p>
                <p className="break-words text-sm text-muted-foreground">
                  Source: {c.source} ·{' '}
                  {c.confirmed_at
                    ? `Confirmed ${new Date(c.confirmed_at).toLocaleString()}`
                    : 'Unconfirmed'}
                </p>
              </div>
              <Button
                variant="outline"
                aria-label={`History for ${c.email}`}
                onClick={() => void inspect(c)}
              >
                View history
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={loading || busy || !pages.length}
          onClick={() => {
            const cursor = pages[pages.length - 1];
            void load(cursor).then((success) => {
              if (success) setPages((p) => p.slice(0, -1));
            });
          }}
        >
          Previous contacts
        </Button>
        <Button
          variant="outline"
          disabled={loading || busy || !next}
          onClick={() => {
            void load(next).then((success) => {
              if (success) setPages((p) => [...p, after]);
            });
          }}
        >
          Next contacts
        </Button>
      </div>
      {timeline && (
        <section className="space-y-4 border-t border-border pt-6" aria-label="Contact history">
          <h3 className="break-all font-semibold">History for {timeline.email}</h3>
          {!timeline.events.length ? (
            <p className="text-sm">No retained events for this contact.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {timeline.events.map((e, i) => (
                <li key={e.id ?? String(i)}>
                  {e.occurred_at || e.created_at
                    ? new Date(e.occurred_at ?? e.created_at!).toLocaleString()
                    : 'Time unavailable'}{' '}
                  · {e.kind ?? e.action ?? 'Recorded event'}
                  {e.source ? ` · ${e.source}` : ''}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <details className="border-t border-border pt-6">
        <summary className="cursor-pointer font-semibold">Import pending contacts from CSV</summary>
        <form onSubmit={importRows} className="mt-4 max-w-2xl space-y-4">
          <p className="text-sm text-muted-foreground">
            Use email and optional locale columns, at most 100 rows and 100 KB. Imports never
            subscribe a mailbox, overwrite consent or suppression, or send confirmation mail. Each
            person must request and confirm their own subscription.
          </p>
          <fieldset disabled={busy} className="space-y-4">
            <div>
              <Label htmlFor="email-import-source">Source label</Label>
              <Input
                id="email-import-source"
                required
                maxLength={100}
                value={source}
                onChange={(e) => setSource(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="email-import-reference">File reference or checksum</Label>
              <Input
                id="email-import-reference"
                required
                maxLength={250}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
              <p className="mt-2 text-sm text-muted-foreground">
                Use a nonpersonal label and reference; no credentials or private notes.
              </p>
            </div>
            <div>
              <Label htmlFor="email-import-file">Contact CSV</Label>
              <Input
                ref={fileInput}
                id="email-import-file"
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => void readFile(e.target.files?.[0])}
              />
            </div>
            {rows && (
              <p role="status">
                {rows.length} rows validated. Import will preserve existing records and add only new
                pending contacts.
              </p>
            )}
            <Button disabled={!rows || !source.trim() || !reference.trim()}>
              {busy ? 'Importing…' : 'Import as pending'}
            </Button>
          </fieldset>
          {importError && <p role="alert">{importError}</p>}
          {notice && <p role="status">{notice}</p>}
        </form>
      </details>
    </section>
  );
}
