import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { supabase } from '@/integrations/supabase/client';
import { AdminEmpty } from '@/components/admin/primitives/AdminEmpty';
import { AdminArchetypeHeader } from '@/components/admin/frames/AdminArchetypeHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
interface Campaign {
  id: string;
  name: string;
  status: string;
  topic: string;
  template_key: string;
  locale: string | null;
  scheduled_at: string | null;
}
interface Message {
  id: string;
  recipient_email: string;
  provider_id: string | null;
  status: string;
  attempts: number;
  template_key: string | null;
  last_error: string | null;
  created_at: string;
}
interface Subscriber {
  id: string;
  email: string;
  status: string;
  topics: string[];
  locale: string;
  confirmed_at: string | null;
}
interface Overview {
  configured: boolean;
  campaigns: Campaign[];
  messages: Message[];
  subscribers: number;
  suppressions: number;
  templates: { template_key: string; name: string; is_active: boolean }[];
}
export default function EmailPlatform() {
  const [data, setData] = useState<Overview | null>(null),
    [error, setError] = useState(false),
    [busy, setBusy] = useState(false);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]),
    [audience, setAudience] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState(''),
    [template, setTemplate] = useState(''),
    [topic, setTopic] = useState('newsletter'),
    [locale, setLocale] = useState(''),
    [schedule, setSchedule] = useState('');
  const [consent, setConsent] = useState<
    { action: string; source: string; created_at: string; topics: string[] }[] | null
  >(null);
  const load = useCallback(async () => {
    setError(false);
    const response = await supabase.functions.invoke('email-admin', { method: 'GET' });
    if (response.error) {
      setError(true);
      return;
    }
    setData(response.data);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Fetch remote preferences/workspace data on mount.
    void load();
  }, [load]);
  async function mutate(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const r = await supabase.functions.invoke('email-admin', { body });
      if (r.error) throw r.error;
      return r.data;
    } catch {
      toast.error('Could not save. Please retry.');
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (
      await mutate({
        action: 'campaign-save',
        ...(editingId ? { id: editingId } : {}),
        name,
        template_key: template,
        topic,
        locale: locale || null,
        scheduled_at: schedule ? new Date(schedule).toISOString() : null,
      })
    ) {
      toast.success('Campaign draft saved');
      setName('');
      setEditingId(null);
      await load();
    }
  }
  async function loadSubscribers() {
    const r = await supabase.functions.invoke('email-admin?resource=subscribers', {
      method: 'GET',
    });
    if (r.error) toast.error('Could not load subscribers');
    else setSubscribers(r.data.subscribers);
  }
  async function showConsent(id: string) {
    const r = await supabase.functions.invoke(
      `email-admin?resource=consent&id=${encodeURIComponent(id)}`,
      { method: 'GET' },
    );
    if (r.error) toast.error('Could not load consent history');
    else setConsent(r.data.events);
  }
  return (
    <div className="space-y-6">
      <AdminArchetypeHeader
        title="Email"
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/admin/email-templates">Edit templates</Link>
            </Button>
            <Button variant="outline" onClick={() => void load()}>
              Refresh
            </Button>
          </>
        }
      />
      <p role="status" className="border border-border bg-muted p-4 text-sm">
        Cloudflare sends transactional email only. Newsletter and marketing drafts can be prepared
        here; campaign delivery is unavailable.
      </p>
      {data && !data.configured && (
        <p role="alert" className="text-sm">
          Transactional delivery is not configured. Complete the email gateway setup before sending.
        </p>
      )}
      {error ? (
        <div role="alert">
          <p>Email administration could not load.</p>
          <Button onClick={() => void load()}>Retry</Button>
        </div>
      ) : !data ? (
        <p role="status">Loading email workspace…</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {data.subscribers} confirmed subscribers · {data.suppressions} suppressed addresses ·
            Showing the latest 50 deliveries and campaigns
          </p>
          <Tabs
            defaultValue="campaigns"
            onValueChange={(tab) => {
              if (tab === 'subscribers') void loadSubscribers();
            }}
          >
            <TabsList>
              <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
              <TabsTrigger value="delivery">Delivery</TabsTrigger>
              <TabsTrigger value="subscribers">Subscribers</TabsTrigger>
            </TabsList>
            <TabsContent value="campaigns" className="space-y-8">
              <form onSubmit={save} className="max-w-2xl space-y-4 border-b border-border py-6">
                <h2 className="text-lg font-semibold">
                  {editingId ? 'Edit campaign draft' : 'Prepare a campaign'}
                </h2>
                <div>
                  <Label htmlFor="campaign-name">Campaign name</Label>
                  <Input
                    id="campaign-name"
                    required
                    maxLength={200}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="campaign-template">Saved email template</Label>
                  <select
                    id="campaign-template"
                    className="flex min-h-10 w-full border border-input bg-background px-4"
                    required
                    value={template}
                    onChange={(e) => setTemplate(e.target.value)}
                  >
                    <option value="">Choose an active template</option>
                    {data.templates
                      .filter((t) => t.is_active)
                      .map((t) => (
                        <option key={t.template_key} value={t.template_key}>
                          {t.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="campaign-topic">Subscribed topic</Label>
                    <select
                      id="campaign-topic"
                      className="min-h-10 w-full border border-input bg-background px-4"
                      value={topic}
                      onChange={(e) => {
                        setTopic(e.target.value);
                        setAudience(null);
                      }}
                    >
                      <option value="newsletter">Newsletter</option>
                      <option value="product_updates">Product updates</option>
                      <option value="events">Events</option>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="campaign-locale">Language code (optional)</Label>
                    <Input
                      id="campaign-locale"
                      placeholder="All languages"
                      value={locale}
                      onChange={(e) => {
                        setLocale(e.target.value);
                        setAudience(null);
                      }}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="campaign-schedule">
                    Desired send date (local time, optional)
                  </Label>
                  <Input
                    id="campaign-schedule"
                    type="datetime-local"
                    value={schedule}
                    onChange={(e) => setSchedule(e.target.value)}
                  />
                  <p className="mt-2 text-sm text-muted-foreground">
                    Dates are saved for planning. Scheduled campaigns remain blocked until delivery
                    is supported.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={async () => {
                      const r = await mutate({
                        action: 'audience-count',
                        topic,
                        locale: locale || null,
                      });
                      if (r)
                        setAudience(`${r.eligible}${r.truncated ? '+' : ''} eligible subscribers`);
                    }}
                  >
                    Check audience
                  </Button>
                  <Button disabled={busy}>
                    {busy ? 'Saving…' : editingId ? 'Save changes' : 'Save draft'}
                  </Button>
                  {audience && (
                    <p role="status" className="text-sm">
                      {audience}
                    </p>
                  )}
                </div>
              </form>
              <section aria-label="Campaign drafts">
                <h2 className="mb-4 text-lg font-semibold">Campaign drafts</h2>
                {!data.campaigns.length ? (
                  <AdminEmpty noun="campaign drafts" />
                ) : (
                  <ul className="divide-y divide-border">
                    {data.campaigns.map((c) => (
                      <li
                        key={c.id}
                        className="flex flex-wrap items-center justify-between gap-4 py-4"
                      >
                        <div>
                          <h3 className="font-semibold">{c.name}</h3>
                          <p className="text-sm text-muted-foreground">
                            {c.topic} · {c.status}
                            {c.scheduled_at
                              ? ` · ${new Date(c.scheduled_at).toLocaleString()}`
                              : ''}
                          </p>
                        </div>
                        {c.status !== 'cancelled' && (
                          <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() => {
                              setEditingId(c.id);
                              setName(c.name);
                              setTemplate(c.template_key);
                              setTopic(c.topic);
                              setLocale(c.locale || '');
                              setAudience(null);
                              if (c.scheduled_at) {
                                const d = new Date(c.scheduled_at);
                                d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
                                setSchedule(d.toISOString().slice(0, 16));
                              } else setSchedule('');
                            }}
                          >
                            Edit draft
                          </Button>
                        )}
                        {c.status !== 'cancelled' && (
                          <Button
                            variant="outline"
                            disabled={busy}
                            onClick={async () => {
                              if (await mutate({ action: 'campaign-cancel', id: c.id }))
                                await load();
                            }}
                          >
                            Cancel draft
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </TabsContent>
            <TabsContent value="delivery">
              <section className="py-6">
                <h2 className="mb-4 text-lg font-semibold">Recent transactional delivery</h2>
                {!data.messages.length ? (
                  <AdminEmpty noun="transactional messages" />
                ) : (
                  <ul className="divide-y divide-border">
                    {data.messages.map((m) => (
                      <li key={m.id} className="space-y-2 py-4">
                        <div className="flex flex-wrap justify-between gap-2">
                          <strong>{m.template_key || 'Transactional message'}</strong>
                          <span>{m.status}</span>
                        </div>
                        <p className="break-all text-sm">{m.recipient_email}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(m.created_at).toLocaleString()} · {m.attempts} attempts
                        </p>
                        {m.last_error && <p className="break-words text-sm">{m.last_error}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </TabsContent>
            <TabsContent value="subscribers">
              <section className="space-y-4 py-6">
                <h2 className="text-lg font-semibold">Recent subscribers</h2>
                <p className="text-sm text-muted-foreground">
                  Showing up to 100 subscriptions. A pending subscription cannot receive
                  newsletters.
                </p>
                {!subscribers.length ? (
                  <AdminEmpty noun="subscriptions" />
                ) : (
                  <ul className="divide-y divide-border">
                    {subscribers.map((s) => (
                      <li
                        key={s.id}
                        className="flex flex-wrap items-center justify-between gap-4 py-4"
                      >
                        <div className="min-w-0">
                          <p className="break-all font-semibold">{s.email}</p>
                          <p className="text-sm text-muted-foreground">
                            {s.status} · {s.locale} · {s.topics.join(', ')}
                          </p>
                        </div>
                        <Button variant="outline" onClick={() => void showConsent(s.id)}>
                          Consent history
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                {consent && (
                  <section aria-label="Consent history" className="border-t border-border pt-4">
                    <h3 className="font-semibold">Consent history</h3>
                    <ul>
                      {consent.map((e, i) => (
                        <li key={i} className="py-2 text-sm">
                          {new Date(e.created_at).toLocaleString()} · {e.action} · {e.source} ·{' '}
                          {e.topics.join(', ')}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </section>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
