import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
interface Experiment {
  id: string;
  version: number;
  status: string;
  goal: string;
  window_seconds: number;
  excluded: number;
  variants: {
    key: string;
    weight: number;
    template_key: string | null;
    subject: string | null;
    assigned: number;
    linked_accounts: number;
  }[];
}
interface Draft {
  goal: string;
  days: string;
  control: string;
  weightA: string;
  templateA: string;
  templateB: string;
}
export function EmailExperiments({
  campaign,
  templates,
  ready,
}: {
  campaign: { id: string; version: number; template_key: string; status: string };
  templates: { template_key: string; name: string; is_active: boolean }[];
  ready: boolean;
}) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({}),
    [experiments, setExperiments] = useState<Experiment[]>([]),
    [loaded, setLoaded] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState<{ identity: string; text: string } | null>(null),
    [error, setError] = useState(false);
  const request = useRef(0),
    identity = `${campaign.id}:${campaign.version}`;
  const draft = drafts[identity] ?? {
    goal: 'username_claimed',
    days: '7',
    control: '10',
    weightA: '45',
    templateA: campaign.template_key,
    templateB: '',
  };
  function notify(text: string) {
    setNotice({ identity, text });
  }
  function change(field: keyof Draft, value: string) {
    setDrafts((prev) => ({ ...prev, [identity]: { ...draft, [field]: value } }));
    setNotice(null);
  }
  const load = useCallback(async () => {
    const sequence = ++request.current;
    setError(false);
    try {
      const r = await supabase.functions.invoke(
        `email-admin?resource=experiments&campaign=${campaign.id}`,
        { method: 'GET' },
      );
      if (sequence !== request.current) return;
      if (r.error || !Array.isArray(r.data?.experiments)) throw new Error('experiments');
      setExperiments(r.data.experiments);
      setLoaded(identity);
    } catch {
      if (sequence === request.current) setError(true);
    }
  }, [campaign.id, identity]);
  useEffect(() => {
    const pending = request;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Refresh remote definitions when the selected campaign version changes.
    void load();
    return () => {
      ++pending.current;
    };
  }, [load]);
  const control = Number(draft.control),
    a = Number(draft.weightA),
    b = 100 - control - a,
    days = Number(draft.days),
    valid =
      Number.isInteger(control) &&
      control >= 1 &&
      control <= 98 &&
      Number.isInteger(a) &&
      a >= 1 &&
      b >= 1 &&
      Number.isInteger(days) &&
      days >= 1 &&
      days <= 30 &&
      !!draft.templateA &&
      !!draft.templateB &&
      draft.templateA !== draft.templateB;
  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    const sequence = ++request.current;
    setBusy(true);
    setNotice(null);
    try {
      const r = await supabase.functions.invoke('email-admin', {
        body: {
          action: 'experiment-create',
          campaign_id: campaign.id,
          expected_version: campaign.version,
          goal: draft.goal,
          window_seconds: days * 86400,
          variants: [
            { key: 'control', weight: control },
            { key: 'a', weight: a, template_key: draft.templateA },
            { key: 'b', weight: b, template_key: draft.templateB },
          ],
        },
      });
      if (sequence !== request.current) return;
      if (r.error) {
        notify(
          r.error.context?.status === 409
            ? 'This campaign version changed or already has an experiment. Refresh definitions; your draft is preserved.'
            : 'The plan could not be created. Check the ready audience and active templates. Your draft is preserved.',
        );
        return;
      }
      notify(
        'Experiment definition saved. Assignment will continue in bounded batches. No email is sent and no outcome window has started.',
      );
      await load();
    } catch {
      if (sequence === request.current)
        notify(
          'The experiment result is unavailable. Refresh definitions before retrying; your draft is preserved.',
        );
    } finally {
      setBusy(false);
    }
  }
  const shown = loaded === identity ? experiments : [];
  return (
    <section className="space-y-4 border-t border-border pt-6" aria-label="Campaign experiments">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h3 className="font-semibold">Experiment preparation</h3>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void load()}>
          Refresh experiment definitions
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Definitions pin template content, a control group and an outcome window. Assignments are
        stable and do not send email. Cloudflare cannot deliver these campaigns, so there are no
        exposures, no started outcome windows and no measured winner.
      </p>
      {error && (
        <p role="alert">Experiment definitions could not load. Refresh before creating a plan.</p>
      )}
      {notice?.identity === identity && (
        <p role="status" className="text-sm">
          {notice.text}
        </p>
      )}
      {loaded === identity &&
        !shown.some((e) => e.version === campaign.version) &&
        campaign.status !== 'cancelled' && (
          <form onSubmit={create} className="max-w-2xl space-y-4">
            <p className="text-sm">
              {ready
                ? 'This version has a completed audience snapshot.'
                : 'Collect and finish an audience snapshot for this version before defining an experiment.'}
            </p>
            <fieldset disabled={busy || !ready || error} className="space-y-4">
              <div>
                <Label htmlFor="experiment-goal">Declared app outcome</Label>
                <select
                  id="experiment-goal"
                  className="min-h-10 w-full border border-input bg-background px-4 text-sm"
                  value={draft.goal}
                  onChange={(e) => change('goal', e.target.value)}
                >
                  <option value="username_claimed">Username claimed</option>
                  <option value="event_rsvp">Event RSVP</option>
                  <option value="group_joined">Group joined</option>
                  <option value="trip_accepted">Trip invitation accepted</option>
                </select>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                {(
                  [
                    ['days', 'Outcome window (days)'],
                    ['control', 'Control share (%)'],
                    ['weightA', 'Variant A share (%)'],
                  ] as const
                ).map(([field, label]) => (
                  <div key={field}>
                    <Label htmlFor={`experiment-${field}`}>{label}</Label>
                    <Input
                      id={`experiment-${field}`}
                      type="number"
                      min={1}
                      max={field === 'days' ? 30 : 98}
                      value={draft[field]}
                      onChange={(e) => change(field, e.target.value)}
                    />
                  </div>
                ))}
              </div>
              <p className="text-sm">
                Variant B share: {Number.isFinite(b) ? b : '—'}%. Weights must leave at least 1% for
                each variant and control.
              </p>
              {(
                [
                  ['templateA', 'Variant A template'],
                  ['templateB', 'Variant B template'],
                ] as const
              ).map(([field, label]) => (
                <div key={field}>
                  <Label htmlFor={`experiment-${field}`}>{label}</Label>
                  <select
                    id={`experiment-${field}`}
                    className="min-h-10 w-full border border-input bg-background px-4 text-sm"
                    required
                    value={draft[field]}
                    onChange={(e) => change(field, e.target.value)}
                  >
                    <option value="">Choose an active template</option>
                    {templates
                      .filter((t) => t.is_active)
                      .map((t) => (
                        <option key={t.template_key} value={t.template_key}>
                          {t.name}
                        </option>
                      ))}
                  </select>
                </div>
              ))}
              <Button disabled={!valid}>Save experiment definition</Button>
            </fieldset>
          </form>
        )}
      {shown.map((e) => (
        <div key={e.id} className="space-y-4 border-b border-border pb-4">
          <p className="text-sm">
            Version {e.version} · {e.status}
            {e.version !== campaign.version ? ' · Historical campaign version' : ''} · {e.goal} ·
            Declared {e.window_seconds / 86400}-day window
          </p>
          <ul className="space-y-2 text-sm">
            {e.variants.map((v) => (
              <li key={v.key}>
                {v.key} · {v.weight}% · {v.assigned} assignments · {v.linked_accounts} linked
                accounts{v.template_key ? ` · ${v.template_key}` : ''}
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">
            {e.excluded} excluded during assignment · 0 exposures · Outcomes unmeasured · No winner
          </p>
        </div>
      ))}
    </section>
  );
}
