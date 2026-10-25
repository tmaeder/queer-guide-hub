import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
interface QueueReading {
  available: boolean;
  backlog_count: number | null;
  backlog_bytes: number | null;
  oldest_message_at: string | null;
}
interface Operations {
  queues?: { observed_at: string; events: QueueReading; dead_letter: QueueReading } | null;
  health: {
    as_of: string;
    window_days: number;
    states: Record<string, number>;
    queue_oldest_seconds: number | null;
    expired_leases: number;
    acceptance_p95_seconds: number | null;
    delivery_p95_seconds: number | null;
    unmatched_provider_events: number;
    retention: { payload_days: number };
    dlq_visibility: string;
  };
  jobs: { id: string; status: string; scanned: number; created_at: string }[];
  events: {
    id: string;
    object_type: string;
    object_id: string;
    action: string;
    created_at: string;
  }[];
}
const seconds = (value: number | null) =>
  value === null ? 'No observations' : `${Math.round(value)} seconds`;
const backlog = (reading: QueueReading | undefined) =>
  reading?.available && reading.backlog_count !== null
    ? reading.backlog_count.toLocaleString()
    : 'Unavailable';
function queueAge(reading: QueueReading | undefined, observed: string | undefined) {
  if (!reading?.available) return 'Unavailable';
  if (reading.backlog_count === 0) return 'No pending events';
  if (!reading.oldest_message_at || !observed) return 'Age unavailable';
  return seconds(
    Math.max(0, (Date.parse(observed) - Date.parse(reading.oldest_message_at)) / 1000),
  );
}
export function EmailOperations() {
  const [data, setData] = useState<Operations | null>(null),
    [error, setError] = useState(false),
    [busy, setBusy] = useState(false),
    [id, setId] = useState(''),
    [notice, setNotice] = useState<string | null>(null);
  const request = useRef(0);
  async function load() {
    const sequence = ++request.current;
    setError(false);
    try {
      const r = await supabase.functions.invoke('email-operations', { method: 'GET' });
      if (sequence !== request.current) return;
      if (
        r.error ||
        !r.data?.health ||
        !Array.isArray(r.data.events) ||
        !Array.isArray(r.data.jobs)
      )
        throw new Error('operations');
      setData(r.data);
    } catch {
      if (sequence === request.current) setError(true);
    }
  }
  useEffect(() => {
    const pending = request;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Load remote operational observations on mount.
    void load();
    return () => {
      ++pending.current;
    };
  }, []);
  async function reconcile(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const r = await supabase.functions.invoke('email-operations', {
        body: { action: 'reconcile', id: id.trim() },
      });
      if (r.error) throw new Error('reconcile');
      setNotice(
        r.data.found
          ? `Receipt inspected. Current status: ${r.data.status}. ${r.data.changed ? 'Database receipt updated.' : 'No state change.'} No email was sent.`
          : 'No durable receipt was found. The message remains unchanged. No email was sent.',
      );
      await load();
    } catch {
      setNotice(
        'Receipt inspection failed. The message was not retried. Try again when the gateway is available.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-8 py-6" aria-label="Email operations">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-sans text-title font-bold">Delivery operations</h2>
        <Button variant="outline" onClick={() => void load()}>
          Refresh operations
        </Button>
      </div>
      {error && <p role="alert">Operations could not load. Use Refresh operations to retry.</p>}
      {!data && !error && <p role="status">Loading operations…</p>}
      {data && (
        <>
          <p className="text-sm text-muted-foreground">
            Observed at {new Date(data.health.as_of).toLocaleString()}. Counts and latency cover the
            last {data.health.window_days} days. Provider acceptance does not prove inbox placement.
          </p>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              [
                'Oldest overdue message',
                data.health.queue_oldest_seconds === 0
                  ? 'None'
                  : seconds(data.health.queue_oldest_seconds),
              ],
              ['Expired processing leases', data.health.expired_leases],
              ['Acceptance time, 95th percentile', seconds(data.health.acceptance_p95_seconds)],
              ['Delivery time, 95th percentile', seconds(data.health.delivery_p95_seconds)],
              ['Provider events without a matched receipt', data.health.unmatched_provider_events],
              ['Terminal message body retention', `${data.health.retention.payload_days} days`],
              ['Queued delivery events', backlog(data.queues?.events)],
              ['Dead-letter delivery events', backlog(data.queues?.dead_letter)],
              [
                'Oldest queued delivery event',
                queueAge(data.queues?.events, data.queues?.observed_at),
              ],
              [
                'Oldest dead-letter delivery event',
                queueAge(data.queues?.dead_letter, data.queues?.observed_at),
              ],
            ].map(([label, value]) => (
              <div key={label} className="border-b border-border pb-4">
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="mt-2 font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          {data.queues?.dead_letter.available &&
            (data.queues.dead_letter.backlog_count ?? 0) > 0 && (
              <p role="alert" className="text-sm">
                Delivery events need recovery. Inspect the dead-letter queue before its retention
                expires. Refreshing operations does not resend messages.
              </p>
            )}
          <p className="text-sm text-muted-foreground">
            {data.queues
              ? `Queue measurements checked at ${new Date(data.queues.observed_at).toLocaleString()}. Counts are best-effort Cloudflare snapshots; unavailable measurements never mean zero.`
              : 'Queue measurements are unavailable. Refresh operations or inspect the queues in Cloudflare.'}
          </p>
          <section aria-label="Delivery state counts">
            <h3 className="font-semibold">Observed delivery states</h3>
            {Object.keys(data.health.states).length ? (
              <ul className="mt-4 flex flex-wrap gap-4 text-sm">
                {Object.entries(data.health.states).map(([state, count]) => (
                  <li key={state}>
                    {state}: {count}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm">No messages in this window.</p>
            )}
          </section>
          <p className="text-sm text-muted-foreground">
            Retention removes old terminal message bodies in bounded batches. It preserves
            suppression, consent and message identities. Queued and uncertain messages retain their
            evidence.
          </p>
        </>
      )}
      <form onSubmit={reconcile} className="max-w-2xl space-y-4 border-t border-border pt-6">
        <h3 className="font-semibold">Inspect a durable gateway receipt</h3>
        <p className="text-sm text-muted-foreground">
          Use a message ID from the delivery log. Inspection can recover a previously accepted
          receipt and apply stored provider events. It cannot resend an uncertain message.
        </p>
        <Label htmlFor="email-receipt-id">Message ID</Label>
        <Input
          id="email-receipt-id"
          value={id}
          onChange={(e) => setId(e.target.value)}
          required
          pattern="[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}"
          disabled={busy}
        />
        <Button disabled={busy || !id.trim()}>{busy ? 'Inspecting…' : 'Inspect receipt'}</Button>
        {notice && (
          <p role="status" className="text-sm">
            {notice}
          </p>
        )}
      </form>
      {data && (
        <>
          <section
            className="space-y-4 border-t border-border pt-6"
            aria-label="Audience collection jobs"
          >
            <h3 className="font-semibold">Recent audience collection</h3>
            {!data.jobs.length ? (
              <p className="text-sm">No collection jobs.</p>
            ) : (
              <ul className="divide-y divide-border">
                {data.jobs.map((j) => (
                  <li key={j.id} className="py-4 text-sm">
                    <p className="break-all">{j.id}</p>
                    <p>
                      {j.status} · {j.scanned} scanned · {new Date(j.created_at).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section
            className="space-y-4 border-t border-border pt-6"
            aria-label="Email operator audit"
          >
            <h3 className="font-semibold">Recent operator actions</h3>
            {!data.events.length ? (
              <p className="text-sm">No recorded operator actions.</p>
            ) : (
              <ul className="divide-y divide-border">
                {data.events.map((e) => (
                  <li key={e.id} className="py-4 text-sm">
                    <p>
                      {e.object_type} · {e.action} · {new Date(e.created_at).toLocaleString()}
                    </p>
                    <p className="break-all">{e.object_id}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </section>
  );
}
