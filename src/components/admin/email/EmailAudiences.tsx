import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AdminEmpty } from '@/components/admin/primitives/AdminEmpty';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AudienceRuleEditor } from './AudienceRuleEditor';
import { defaultRule, ruleError, topics, type Rule } from './audienceRules';
interface Segment {
  id: string;
  name: string;
  rule: Rule;
  version: number;
  status: 'active' | 'archived';
}
interface Preview {
  evaluated_at: string;
  matched: number;
  eligible: number;
  excluded: Record<string, number>;
  sample: { id: string; email: string; status: string; locale: string; reason: string }[];
}
const reasonNames: Record<string, string> = {
  eligible: 'Eligible',
  recipient_suppressed: 'Address suppressed',
  account_disabled: 'Account disabled',
  pending_confirmation: 'Pending confirmation',
  unsubscribed: 'Unsubscribed',
  topic_not_subscribed: 'Topic not subscribed',
  not_subscribed: 'Not subscribed',
  unconfirmed: 'Not confirmed',
  topic_not_selected: 'Topic not selected',
};
const reasonName = (reason: string) => reasonNames[reason] || reason.replaceAll('_', ' ');
export function EmailAudiences() {
  const id = useId();
  const [segments, setSegments] = useState<Segment[] | null>(null);
  const [listError, setListError] = useState(false);
  const [selected, setSelected] = useState<Segment | null>(null);
  const [name, setName] = useState('');
  const [rule, setRule] = useState<Rule>(defaultRule);
  const [status, setStatus] = useState<'active' | 'archived'>('active');
  const [topic, setTopic] = useState('newsletter');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<'save' | 'preview' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const revision = useRef(0);
  const listRequest = useRef(0);
  const load = useCallback(async () => {
    const request = ++listRequest.current;
    try {
      const result = await supabase.functions.invoke('email-admin?resource=segments', {
        method: 'GET',
      });
      if (request !== listRequest.current) return;
      if (result.error || !Array.isArray(result.data?.segments)) throw new Error('load');
      setSegments(result.data.segments);
      setListError(false);
      return result.data.segments as Segment[];
    } catch {
      if (request === listRequest.current) setListError(true);
      return undefined;
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Load authorized remote audience definitions.
    void load();
    const currentRevision = revision;
    const currentListRequest = listRequest;
    return () => {
      ++currentRevision.current;
      ++currentListRequest.current;
    };
  }, [load]);
  function changed() {
    ++revision.current;
    setDirty(true);
    setPreview(null);
    setNotice(null);
  }
  function edit(segment: Segment | null) {
    ++revision.current;
    setSelected(segment);
    setName(segment?.name ?? '');
    setRule(segment?.rule ?? defaultRule());
    setStatus(segment?.status ?? 'active');
    setDirty(false);
    setConflict(false);
    setPreview(null);
    setNotice(null);
  }
  const validation = ruleError(rule);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy || validation || conflict || !name.trim()) return;
    const request = revision.current;
    setBusy('save');
    setNotice(null);
    try {
      const result = await supabase.functions.invoke('email-admin', {
        body: {
          action: 'segment-save',
          name: name.trim(),
          rule,
          status,
          ...(selected ? { id: selected.id, expected_version: selected.version } : {}),
        },
      });
      if (request !== revision.current) return;
      if (result.error) {
        if (result.error.context?.status === 409) {
          setConflict(true);
          setNotice(
            'Another administrator changed this audience. Your edits are preserved. Reload the saved definition or save your edits as a new audience.',
          );
        } else
          setNotice('Audience could not be saved. Your edits are preserved; retry when ready.');
        return;
      }
      const saved = result.data.segment;
      if (!saved?.id || !Number.isInteger(saved.version)) throw new Error('receipt');
      setSelected({ id: saved.id, version: saved.version, name: name.trim(), rule, status });
      setDirty(false);
      setNotice(`Audience saved as version ${saved.version}.`);
      await load();
    } catch {
      if (request === revision.current)
        setNotice('Audience could not be saved. Your edits are preserved; retry when ready.');
    } finally {
      setBusy(null);
    }
  }
  async function evaluate() {
    if (busy || validation) return;
    const request = revision.current;
    setBusy('preview');
    setPreview(null);
    setNotice(null);
    try {
      const result = await supabase.functions.invoke('email-admin', {
        body: { action: 'segment-preview', rule, ...(topic ? { topic } : {}), limit: 25 },
      });
      if (request !== revision.current) return;
      if (result.error || !result.data?.preview) throw new Error('preview');
      setPreview(result.data.preview);
    } catch {
      if (request === revision.current)
        setNotice('Preview could not load. Retry to check the current audience.');
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="space-y-8 py-6">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Saved audiences</h2>
        <Button type="button" variant="outline" disabled={!!busy} onClick={() => void load()}>
          Refresh saved audiences
        </Button>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Build rules from subscription details, consent and delivery evidence. A matching contact
          may still be excluded by current consent or suppression. These definitions do not enable
          campaign delivery.
        </p>
      </div>
      <section aria-label="Saved audience definitions" className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Showing up to 100 recently updated definitions.
        </p>
        {listError && (
          <div role="alert">
            <p>Saved audiences could not load.</p>
            <Button variant="outline" onClick={() => void load()}>
              Retry audience list
            </Button>
          </div>
        )}
        {segments === null && !listError && <p role="status">Loading saved audiences…</p>}
        {segments?.length === 0 && (
          <AdminEmpty
            noun="saved audiences"
            variant="inline"
            description="Define your first audience below."
          />
        )}
        <ul className="divide-y divide-border">
          {segments?.map((segment) => (
            <li key={segment.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
              <div className="min-w-0">
                <h3 className="break-words font-medium">{segment.name}</h3>
                <p className="text-sm text-muted-foreground">
                  Version {segment.version} · {segment.status}
                </p>
              </div>
              <Button
                variant="outline"
                disabled={!!busy || dirty || conflict}
                onClick={() => edit(segment)}
                aria-label={`Edit ${segment.name}`}
              >
                Edit audience
              </Button>
            </li>
          ))}
        </ul>
        {(dirty || conflict) && (
          <p className="text-sm text-muted-foreground">
            Save or discard your current edits before opening another definition.
          </p>
        )}
      </section>
      <form onSubmit={save} className="max-w-3xl space-y-6 border-t border-border pt-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">
            {selected ? `Edit audience · version ${selected.version}` : 'New audience'}
          </h2>
          <Button type="button" variant="ghost" disabled={!!busy} onClick={() => edit(null)}>
            {dirty || conflict ? 'Discard edits and start new' : 'New audience'}
          </Button>
        </div>
        <fieldset disabled={busy === 'save'} className="min-w-0 space-y-6">
          <label className="block text-sm font-medium" htmlFor={`${id}-name`}>
            Audience name
            <Input
              id={`${id}-name`}
              required
              maxLength={200}
              value={name}
              onChange={(e) => {
                changed();
                setName(e.target.value);
              }}
            />
          </label>
          <AudienceRuleEditor
            rule={rule}
            onChange={(next) => {
              changed();
              setRule(next);
            }}
          />
          {validation && (
            <p role="alert" className="text-sm">
              {validation}
            </p>
          )}
          <label className="block max-w-xs text-sm">
            Definition status
            <select
              className="min-h-10 w-full rounded-element border border-input bg-background px-4"
              value={status}
              onChange={(e) => {
                changed();
                setStatus(e.target.value as 'active' | 'archived');
              }}
            >
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <div className="flex flex-wrap gap-4">
            <Button disabled={!!busy || !!validation || conflict || !name.trim()}>
              {busy === 'save' ? 'Saving audience…' : 'Save audience'}
            </Button>
            {conflict && (
              <Button
                type="button"
                variant="outline"
                disabled={!!busy}
                onClick={() => {
                  ++revision.current;
                  setSelected(null);
                  setStatus('active');
                  setConflict(false);
                  setDirty(true);
                  setPreview(null);
                  setNotice(
                    'Your edits are now a new audience. Choose Save audience to create it.',
                  );
                }}
              >
                Keep edits as new audience
              </Button>
            )}
            {conflict && (
              <Button
                type="button"
                variant="outline"
                disabled={!!busy}
                onClick={async () => {
                  setBusy('save');
                  const latest = (await load())?.find((s) => s.id === selected?.id);
                  if (latest) edit(latest);
                  else
                    setNotice(
                      'The saved definition could not be reloaded. Your edits are preserved.',
                    );
                  setBusy(null);
                }}
              >
                Discard edits and reload saved definition
              </Button>
            )}
          </div>
        </fieldset>
        {notice && (
          <p role="status" className="text-sm">
            {notice}
          </p>
        )}
      </form>
      <section
        aria-label="Audience preview"
        className="max-w-3xl space-y-4 border-t border-border pt-6"
      >
        <h2 className="text-lg font-semibold">Preview current rule</h2>
        <p className="text-sm text-muted-foreground">
          Counts reflect current data. The sample shows up to 25 contacts, including exclusions.
          Recheck permissions before any future send.
        </p>
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-sm">
            Check consent for topic
            <select
              className="block min-h-10 rounded-element border border-input bg-background px-4"
              value={topic}
              disabled={busy === 'save'}
              onChange={(e) => {
                ++revision.current;
                setTopic(e.target.value);
                setPreview(null);
                setNotice(null);
              }}
            >
              <option value="">Any subscribed topic</option>
              {topics.map((t) => (
                <option key={t} value={t}>
                  {t.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            variant="outline"
            disabled={!!busy || !!validation}
            onClick={() => void evaluate()}
          >
            {busy === 'preview' ? 'Checking audience…' : 'Preview audience'}
          </Button>
        </div>
        {preview && (
          <div className="space-y-4">
            <p role="status" className="text-sm">
              <strong>
                {preview.matched} matching contacts · {preview.eligible} eligible
              </strong>
              <br />
              Evaluated {new Date(preview.evaluated_at).toLocaleString()}. Campaign delivery remains
              unavailable.
            </p>
            {Object.keys(preview.excluded).length > 0 && (
              <div>
                <h3 className="text-sm font-medium">Excluded contacts</h3>
                <ul className="text-sm">
                  {Object.entries(preview.excluded).map(([reason, count]) => (
                    <li key={reason}>
                      {reasonName(reason)}: {count}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {preview.sample.length ? (
              <ul aria-label="Audience sample" className="divide-y divide-border">
                {preview.sample.map((contact) => (
                  <li
                    key={contact.id}
                    className="flex flex-wrap justify-between gap-2 py-4 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="break-all font-medium">{contact.email}</p>
                      <p className="text-muted-foreground">
                        {contact.locale} · {contact.status}
                      </p>
                    </div>
                    <span>{reasonName(contact.reason)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm">No contacts match this rule.</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
