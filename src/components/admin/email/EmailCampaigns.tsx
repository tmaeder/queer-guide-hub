import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AdminEmpty } from '@/components/admin/primitives/AdminEmpty';
import { reviewDocument } from './emailDocument';
export interface Campaign {
  id: string;
  name: string;
  status: string;
  version: number;
  review_state: string;
  topic: string;
  template_key: string;
  locale: string | null;
  scheduled_at: string | null;
  segment_id: string | null;
}
interface Audience {
  id: string;
  version: number;
  status: string;
  scanned: number;
  matched: number;
  eligible_at_capture: number;
  started_at: string;
  completed_at: string | null;
  excluded: Record<string, number>;
  sample: {
    id: string;
    email: string;
    captured_reason: string;
    current_reason: string;
    evaluated_at: string;
  }[];
}
interface Detail {
  campaign: Campaign;
  version: { content: { subject: string; html_content: string; text_content: string } } | null;
  versions: { version: number; created_at: string }[];
  reviews: { version: number; action: string; created_at: string }[];
  audiences: Audience[];
}
interface Props {
  campaigns: Campaign[];
  templates: { template_key: string; name: string; is_active: boolean }[];
  refresh: () => Promise<void>;
  audienceRevision: number;
}
const selectStyle = 'min-h-10 w-full border border-input bg-background px-4 text-sm';
export function EmailCampaigns({ campaigns, templates, refresh, audienceRevision }: Props) {
  const uid = useId(),
    revision = useRef(0),
    detailRequest = useRef(0),
    audienceRequest = useRef(0);
  const [selected, setSelected] = useState<Campaign | null>(null),
    [detail, setDetail] = useState<Detail | null>(null);
  const [name, setName] = useState(''),
    [template, setTemplate] = useState(''),
    [topic, setTopic] = useState('newsletter');
  const [locale, setLocale] = useState(''),
    [schedule, setSchedule] = useState(''),
    [segment, setSegment] = useState('');
  const [segments, setSegments] = useState<
    { id: string; name: string; version: number; status: string }[]
  >([]);
  const [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState<string | null>(null),
    [segmentError, setSegmentError] = useState(false);
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const loadSegments = useCallback(async () => {
    const request = ++audienceRequest.current;
    try {
      const r = await supabase.functions.invoke('email-admin?resource=segments', { method: 'GET' });
      if (request !== audienceRequest.current) return;
      if (r.error || !Array.isArray(r.data?.segments)) throw new Error('audiences');
      setSegments(r.data.segments);
      setSegmentError(false);
    } catch {
      if (request === audienceRequest.current) setSegmentError(true);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Refresh saved audiences after an explicit editor save.
    void loadSegments();
  }, [loadSegments, audienceRevision]);
  useEffect(() => {
    const r = revision,
      d = detailRequest,
      a = audienceRequest;
    return () => {
      ++r.current;
      ++d.current;
      ++a.current;
    };
  }, []);
  function change() {
    ++revision.current;
    setDirty(true);
    setNotice(null);
    setAudienceCount(null);
  }
  function reset() {
    ++revision.current;
    ++detailRequest.current;
    setSelected(null);
    setDetail(null);
    setName('');
    setTemplate('');
    setTopic('newsletter');
    setLocale('');
    setSchedule('');
    setSegment('');
    setDirty(false);
    setConflict(false);
    setNotice(null);
    setAudienceCount(null);
  }
  async function open(c: Campaign, edit = false) {
    const request = ++detailRequest.current;
    const editorRevision = revision.current;
    if (edit) setBusy(true);
    try {
      const r = await supabase.functions.invoke(
        `email-admin?resource=campaign&id=${encodeURIComponent(c.id)}`,
        { method: 'GET' },
      );
      if (request !== detailRequest.current || (edit && editorRevision !== revision.current))
        return;
      if (r.error || !r.data?.campaign) throw new Error('detail');
      setDetail(r.data);
      if (edit) {
        const current = r.data.campaign as Campaign;
        ++revision.current;
        setSelected(current);
        setName(current.name);
        setTemplate(current.template_key);
        setTopic(current.topic);
        setLocale(current.locale || '');
        setSegment(current.segment_id || '');
        if (current.scheduled_at) {
          const d = new Date(current.scheduled_at);
          d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
          setSchedule(d.toISOString().slice(0, 16));
        } else setSchedule('');
        setDirty(false);
        setConflict(false);
        setAudienceCount(null);
        setNotice(null);
      }
    } catch {
      if (request === detailRequest.current)
        setNotice('Could not load the campaign. Your edits are preserved.');
    } finally {
      if (edit && request === detailRequest.current) setBusy(false);
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy || conflict) return;
    const request = revision.current;
    setBusy(true);
    setNotice(null);
    try {
      const r = await supabase.functions.invoke('email-admin', {
        body: {
          action: 'campaign-save',
          name: name.trim(),
          template_key: template,
          topic,
          locale: locale || null,
          scheduled_at: schedule ? new Date(schedule).toISOString() : null,
          segment_id: segment || null,
          ...(selected ? { id: selected.id, expected_version: selected.version } : {}),
        },
      });
      if (request !== revision.current) return;
      if (r.error) {
        if (r.error.context?.status === 409) {
          setConflict(true);
          setNotice(
            'Another administrator changed this campaign. Your edits are preserved. Reload the saved version or keep your edits as a new draft.',
          );
        } else
          setNotice(
            'Could not save the campaign. Check the active template and audience, then retry. Your edits are preserved.',
          );
        return;
      }
      if (!r.data?.campaign?.id || !Number.isInteger(r.data.campaign.version))
        throw new Error('save');
      const saved = {
        id: r.data.campaign.id,
        version: r.data.campaign.version,
        name: name.trim(),
        template_key: template,
        topic,
        locale: locale || null,
        scheduled_at: schedule || null,
        segment_id: segment || null,
        status: r.data.campaign.status,
        review_state: r.data.campaign.review_state,
      };
      setSelected(saved);
      setDirty(false);
      setNotice(
        `Draft saved as version ${saved.version}. Prior approval does not carry over to this revision.`,
      );
      await refresh();
      await open(saved);
    } catch {
      if (request === revision.current)
        setNotice('Could not save the campaign. Your edits are preserved; retry when ready.');
    } finally {
      if (request === revision.current) setBusy(false);
    }
  }
  async function operation(
    c: Campaign,
    action: 'campaign-review' | 'campaign-cancel' | 'campaign-snapshot',
    decision?: string,
  ) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await supabase.functions.invoke('email-admin', {
        body: { action, id: c.id, expected_version: c.version, ...(decision ? { decision } : {}) },
      });
      if (r.error) {
        setNotice(
          r.error.context?.status === 409
            ? 'The campaign changed. Refresh its details before taking this action.'
            : 'Could not complete this action. Refresh the campaign and retry.',
        );
        return;
      }
      if (action === 'campaign-cancel' && selected?.id === c.id && !dirty) reset();
      await refresh();
      await open(c);
      setNotice(
        action === 'campaign-snapshot'
          ? 'Audience collection is queued. Refresh details to follow progress. This does not schedule or send email.'
          : action === 'campaign-cancel'
            ? 'Campaign cancelled. No campaign email was sent.'
            : 'Review decision recorded. Campaign delivery remains unavailable.',
      );
    } catch {
      setNotice('Could not complete this action. Refresh the campaign and retry.');
    } finally {
      setBusy(false);
    }
  }
  async function count() {
    const request = revision.current;
    setBusy(true);
    setNotice(null);
    try {
      const r = await supabase.functions.invoke('email-admin', {
        body: segment
          ? { action: 'segment-preview', id: segment, topic, locale: locale || null, limit: 1 }
          : { action: 'audience-count', topic, locale: locale || null },
      });
      if (request !== revision.current) return;
      if (r.error) throw new Error('count');
      setAudienceCount(segment ? r.data.preview.eligible : r.data.eligible);
    } catch {
      if (request === revision.current)
        setNotice('Could not count the audience. Retry before relying on this preview.');
    } finally {
      if (request === revision.current) setBusy(false);
    }
  }
  const content = detail?.version?.content;
  return (
    <section className="space-y-8 py-6" aria-label="Campaign preparation">
      <form onSubmit={save} className="max-w-2xl space-y-4 border-b border-border pb-6">
        <h2 className="font-sans text-title font-bold">
          {selected ? 'Edit campaign draft' : 'Prepare a campaign'}
        </h2>
        <p className="text-sm text-muted-foreground">
          Save a content version, choose an audience and record review decisions. Approval prepares
          the draft; Cloudflare cannot deliver promotional campaigns.
        </p>
        {notice && (
          <p role="status" className="border border-border p-4 text-sm">
            {notice}
          </p>
        )}
        {conflict && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => selected && void open(selected, true)}
            >
              Reload saved campaign
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                ++revision.current;
                setSelected(null);
                setConflict(false);
                setDirty(true);
                setNotice(null);
              }}
            >
              Keep as new draft
            </Button>
          </div>
        )}
        <fieldset disabled={busy} className="space-y-4">
          <div>
            <Label htmlFor={`${uid}-name`}>Campaign name</Label>
            <Input
              id={`${uid}-name`}
              required
              maxLength={200}
              value={name}
              onChange={(e) => {
                change();
                setName(e.target.value);
              }}
            />
          </div>
          <div>
            <Label htmlFor={`${uid}-template`}>Saved email template</Label>
            <select
              id={`${uid}-template`}
              required
              className={selectStyle}
              value={template}
              onChange={(e) => {
                change();
                setTemplate(e.target.value);
              }}
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
          <div>
            <Label htmlFor={`${uid}-audience`}>Saved audience</Label>
            <select
              id={`${uid}-audience`}
              className={selectStyle}
              value={segment}
              onChange={(e) => {
                change();
                setSegment(e.target.value);
              }}
            >
              <option value="">All eligible subscriptions for this topic</option>
              {segment && !segments.some((s) => s.id === segment) && (
                <option value={segment} disabled>
                  Saved audience unavailable — choose an active audience
                </option>
              )}
              {segments
                .filter((s) => s.status === 'active' || s.id === segment)
                .map((s) => (
                  <option key={s.id} value={s.id} disabled={s.status !== 'active'}>
                    {s.name} · Version {s.version}
                    {s.status !== 'active' ? ' · Archived' : ''}
                  </option>
                ))}
            </select>
            {segmentError && (
              <p role="alert" className="text-sm">
                Saved audiences could not load.{' '}
                <button
                  type="button"
                  className="underline underline-offset-4"
                  onClick={() => void loadSegments()}
                >
                  Retry audiences
                </button>
              </p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor={`${uid}-topic`}>Subscribed topic</Label>
              <select
                id={`${uid}-topic`}
                className={selectStyle}
                value={topic}
                onChange={(e) => {
                  change();
                  setTopic(e.target.value);
                }}
              >
                <option value="newsletter">Newsletter</option>
                <option value="product_updates">Product updates</option>
                <option value="events">Events</option>
              </select>
            </div>
            <div>
              <Label htmlFor={`${uid}-locale`}>Language code (optional)</Label>
              <Input
                id={`${uid}-locale`}
                value={locale}
                placeholder="All languages"
                onChange={(e) => {
                  change();
                  setLocale(e.target.value);
                }}
              />
            </div>
          </div>
          <div>
            <Label htmlFor={`${uid}-schedule`}>Desired date (local time)</Label>
            <Input
              id={`${uid}-schedule`}
              type="datetime-local"
              value={schedule}
              onChange={(e) => {
                change();
                setSchedule(e.target.value);
              }}
            />
            <p className="mt-2 text-sm text-muted-foreground">
              For planning only. No send is scheduled while Cloudflare limits delivery to
              transactional email.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={conflict || !name.trim() || !template}>
              {busy ? 'Saving…' : 'Save draft'}
            </Button>
            <Button type="button" variant="outline" onClick={() => void count()}>
              Preview audience count
            </Button>
            {dirty && (
              <Button
                type="button"
                variant="outline"
                onClick={() => (selected ? void open(selected, true) : reset())}
              >
                Discard edits
              </Button>
            )}
            {!dirty && (
              <Button type="button" variant="outline" onClick={reset}>
                New campaign
              </Button>
            )}
          </div>
          {audienceCount !== null && (
            <p className="text-sm" role="status">
              {audienceCount} currently eligible subscriptions. Eligibility can change.
            </p>
          )}
        </fieldset>
      </form>
      <section aria-label="Saved campaigns" className="space-y-4">
        <h2 className="font-sans text-title font-bold">Saved campaigns</h2>
        {!campaigns.length ? (
          <AdminEmpty noun="campaign drafts" />
        ) : (
          <ul className="divide-y divide-border">
            {campaigns.map((c) => (
              <li key={c.id} className="space-y-4 py-4">
                <div className="flex flex-wrap justify-between gap-4">
                  <strong className="min-w-0 break-words">{c.name}</strong>
                  <span className="text-sm">
                    {c.status} · {c.review_state} · Version {c.version}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {c.topic} · {c.locale || 'All languages'}
                  {c.scheduled_at ? ` · Desired ${new Date(c.scheduled_at).toLocaleString()}` : ''}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" disabled={busy} onClick={() => void open(c)}>
                    Review {c.name}
                  </Button>
                  {c.status !== 'cancelled' && (
                    <>
                      <Button
                        variant="outline"
                        disabled={busy || dirty}
                        onClick={() => void open(c, true)}
                      >
                        Edit draft {c.name}
                      </Button>
                      <Button
                        variant="outline"
                        disabled={busy || (dirty && selected?.id === c.id)}
                        onClick={() => void operation(c, 'campaign-cancel')}
                      >
                        Cancel {c.name}
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {detail && (
        <section aria-label="Campaign review" className="space-y-4 border-t border-border pt-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="break-words font-sans text-title font-bold">
                Review {detail.campaign.name}
              </h2>
              <p className="text-sm text-muted-foreground">
                Version {detail.campaign.version} · {detail.campaign.review_state} · Delivery
                unavailable
              </p>
            </div>
            <Button variant="outline" disabled={busy} onClick={() => void open(detail.campaign)}>
              Refresh details
            </Button>
          </div>
          {content ? (
            <>
              <h3 className="font-semibold">{content.subject}</h3>
              <p className="text-sm text-muted-foreground">
                Template variables remain placeholders. Remote images and links are disabled in this
                preview.
              </p>
              <iframe
                title="Campaign content preview"
                sandbox=""
                srcDoc={reviewDocument(content.html_content)}
                className="h-96 w-full border border-border bg-white"
              />
              <details>
                <summary className="cursor-pointer text-sm font-semibold">Plain text</summary>
                <pre className="mt-4 whitespace-pre-wrap break-words font-sans text-sm">
                  {content.text_content || 'This template uses automatic plain-text generation.'}
                </pre>
              </details>
            </>
          ) : (
            <p role="alert">This draft has no content snapshot. Edit and save it before review.</p>
          )}
          {detail.campaign.status !== 'cancelled' && content && (
            <div className="flex flex-wrap gap-2">
              {['draft', 'changes_requested'].includes(detail.campaign.review_state) && (
                <Button
                  disabled={busy || dirty}
                  onClick={() => void operation(detail.campaign, 'campaign-review', 'submit')}
                >
                  Submit for review
                </Button>
              )}
              {detail.campaign.review_state === 'submitted' && (
                <>
                  <Button
                    disabled={busy || dirty}
                    onClick={() => void operation(detail.campaign, 'campaign-review', 'approve')}
                  >
                    Approve this version
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy || dirty}
                    onClick={() =>
                      void operation(detail.campaign, 'campaign-review', 'request_changes')
                    }
                  >
                    Request changes
                  </Button>
                </>
              )}
              <Button
                variant="outline"
                disabled={busy || dirty}
                onClick={() => void operation(detail.campaign, 'campaign-snapshot')}
              >
                Collect audience snapshot
              </Button>
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            Review applies to this content version. Saving an edit resets approval. A snapshot
            records eligibility during collection; it does not freeze consent or authorize delivery.
          </p>
          <details>
            <summary className="cursor-pointer text-sm font-semibold">
              Version and review history
            </summary>
            <ul className="mt-4 space-y-2 text-sm">
              {detail.versions.map((v) => (
                <li key={v.version}>
                  Version {v.version} saved {new Date(v.created_at).toLocaleString()}
                </li>
              ))}
              {detail.reviews.map((r, i) => (
                <li key={`${r.version}-${i}`}>
                  Version {r.version} · {r.action.replaceAll('_', ' ')} ·{' '}
                  {new Date(r.created_at).toLocaleString()}
                </li>
              ))}
            </ul>
          </details>
          <section
            className="space-y-4 border-t border-border pt-4"
            aria-label="Campaign audience snapshots"
          >
            <h3 className="font-semibold">Audience snapshots</h3>
            {!detail.audiences.length ? (
              <p className="text-sm text-muted-foreground">
                No audience has been collected for this campaign.
              </p>
            ) : (
              detail.audiences.map((a) => (
                <div key={a.id} className="space-y-4 border-b border-border pb-4">
                  <p className="text-sm">
                    Version {a.version} · {a.status} · {a.scanned} subscriptions scanned
                  </p>
                  <p className="text-sm">
                    {a.matched} matched · {a.eligible_at_capture} eligible at capture
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Started {new Date(a.started_at).toLocaleString()}
                    {a.completed_at
                      ? ` · Finished ${new Date(a.completed_at).toLocaleString()}`
                      : ' · Collection resumes automatically each minute'}
                  </p>
                  {Object.entries(a.excluded).map(([reason, count]) => (
                    <p key={reason} className="text-sm">
                      {count} excluded: {reason.replaceAll('_', ' ')}
                    </p>
                  ))}
                  {!!a.sample.length && (
                    <details>
                      <summary className="cursor-pointer text-sm font-semibold">
                        Contact evidence (up to 25)
                      </summary>
                      <ul className="mt-4 divide-y divide-border">
                        {a.sample.map((s) => (
                          <li key={s.id} className="space-y-2 py-2 text-sm">
                            <p className="break-all">{s.email}</p>
                            <p>
                              At capture: {s.captured_reason.replaceAll('_', ' ')} · Now:{' '}
                              {s.current_reason.replaceAll('_', ' ')}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              ))
            )}
          </section>
        </section>
      )}
    </section>
  );
}
