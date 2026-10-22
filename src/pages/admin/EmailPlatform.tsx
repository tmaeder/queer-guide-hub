import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { supabase } from '@/integrations/supabase/client';
import { AdminEmpty } from '@/components/admin/primitives/AdminEmpty';
import { AdminArchetypeHeader } from '@/components/admin/frames/AdminArchetypeHeader';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { EmailMeasurement } from '@/components/admin/email/EmailMeasurement';
import { EmailContent } from '@/components/admin/email/EmailContent';
import { EmailContacts } from '@/components/admin/email/EmailContacts';
import { EmailAudiences } from '@/components/admin/email/EmailAudiences';
import { EmailOperations } from '@/components/admin/email/EmailOperations';
import { EmailJourneys } from '@/components/admin/email/EmailJourneys';
import { EmailCampaigns, type Campaign } from '@/components/admin/email/EmailCampaigns';
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
    [error, setError] = useState(false);
  const [audienceRevision, setAudienceRevision] = useState(0);
  const loadRequest = useRef(0);
  const load = useCallback(async () => {
    const request = ++loadRequest.current;
    setError(false);
    try {
      const response = await supabase.functions.invoke('email-admin', { method: 'GET' });
      if (request !== loadRequest.current) return;
      if (
        response.error ||
        !Array.isArray(response.data?.campaigns) ||
        !Array.isArray(response.data?.templates)
      )
        throw new Error('overview');
      setData(response.data);
    } catch {
      if (request === loadRequest.current) setError(true);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Fetch remote preferences/workspace data on mount.
    void load();
  }, [load]);
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
      <p
        role="status"
        aria-label="Cloudflare email capability"
        className="border border-border bg-muted p-4 text-sm"
      >
        Cloudflare sends transactional email only. Newsletter and marketing drafts can be prepared
        here; campaign delivery is unavailable.
      </p>
      {data && !data.configured && (
        <p role="alert" className="text-sm">
          Transactional delivery is not configured. Complete the email gateway setup before sending.
        </p>
      )}
      {error && (
        <div role="alert">
          <p>Email administration could not load.</p>
          <Button onClick={() => void load()}>Retry</Button>
        </div>
      )}
      {!data ? (
        !error && <p role="status">Loading email workspace…</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {data.subscribers} confirmed subscribers · {data.suppressions} suppressed addresses ·
            Showing the latest 50 deliveries and campaigns
          </p>
          <Tabs defaultValue="campaigns">
            <TabsList className="h-auto flex-wrap justify-start gap-1">
              <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
              <TabsTrigger value="audiences">Audiences</TabsTrigger>
              <TabsTrigger value="journeys">Journeys</TabsTrigger>
              <TabsTrigger value="content">Content</TabsTrigger>
              <TabsTrigger value="delivery">Delivery</TabsTrigger>
              <TabsTrigger value="operations">Operations</TabsTrigger>
              <TabsTrigger value="measurement">Measurement</TabsTrigger>
              <TabsTrigger value="subscribers">Subscribers</TabsTrigger>
            </TabsList>
            <TabsContent value="campaigns" forceMount className="data-[state=inactive]:hidden">
              <EmailCampaigns
                campaigns={data.campaigns}
                templates={data.templates}
                refresh={load}
                audienceRevision={audienceRevision}
              />
            </TabsContent>
            <TabsContent value="audiences" forceMount className="data-[state=inactive]:hidden">
              <EmailAudiences onSaved={() => setAudienceRevision((v) => v + 1)} />
            </TabsContent>
            <TabsContent value="content" forceMount className="data-[state=inactive]:hidden">
              <EmailContent templates={data.templates} />
            </TabsContent>
            <TabsContent value="journeys" forceMount className="data-[state=inactive]:hidden">
              <EmailJourneys />
            </TabsContent>
            <TabsContent value="measurement">
              <EmailMeasurement />
            </TabsContent>
            <TabsContent value="operations">
              <EmailOperations />
            </TabsContent>
            <TabsContent value="delivery">
              <section className="py-6">
                <h2 className="mb-4 font-sans text-title font-bold">
                  Recent transactional delivery
                </h2>
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
                        <p className="break-all text-sm text-muted-foreground">
                          Message ID: {m.id}
                        </p>
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
            <TabsContent value="subscribers" forceMount className="data-[state=inactive]:hidden">
              <EmailContacts />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
