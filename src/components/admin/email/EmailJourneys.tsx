import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AdminEmpty } from '@/components/admin/primitives/AdminEmpty';
import {
  initialJourney,
  journeyGraphError,
  journeyTriggers,
  previewJourney,
  type JourneyGraph,
  type JourneyNode,
} from './journeyGraph';

interface Journey {
  id: string;
  name: string;
  version: number;
  status: 'draft' | 'active' | 'paused' | 'archived';
}
interface Version {
  definition: JourneyGraph;
  trigger_event: string;
  trigger_state: string;
  reentry: string;
}
interface Run {
  id: string;
  journey_id: string;
  version: number;
  step_id: string;
  status: string;
  due_at: string;
  last_error: string | null;
}
interface Trace {
  run: Run;
  steps: { step_id: string; kind: string; outcome: string; completed_at: string }[];
}
const selectStyle = 'min-h-10 w-full border border-input bg-background px-4 text-sm';
function JourneyTarget({
  id,
  value,
  onChange,
  label,
  steps,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  label: string;
  steps: string[];
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className={selectStyle}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Choose a step</option>
        {steps.map((key) => (
          <option key={key} value={key}>
            {key}
          </option>
        ))}
      </select>
    </div>
  );
}
export function EmailJourneys() {
  const uid = useId();
  const [journeys, setJourneys] = useState<Journey[]>([]),
    [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<Journey | null>(null);
  const [name, setName] = useState(''),
    [trigger, setTrigger] = useState('0'),
    [reentry, setReentry] = useState('once_per_account');
  const [status, setStatus] = useState<Journey['status']>('draft'),
    [graph, setGraph] = useState<JourneyGraph>(initialJourney);
  const [dirty, setDirty] = useState(false),
    [conflict, setConflict] = useState(false),
    [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null),
    [trace, setTrace] = useState<Trace | null>(null);
  const [sample, setSample] = useState({ profile_exists: true, username_claimed: false });
  const revision = useRef(0),
    listRequest = useRef(0),
    traceRequest = useRef(0);
  const event = journeyTriggers[Number(trigger)] ?? journeyTriggers[0];
  const validation = journeyGraphError(graph, event[0]);
  const load = useCallback(async () => {
    const request = ++listRequest.current;
    try {
      const r = await supabase.functions.invoke('email-journeys', { method: 'GET' });
      if (request !== listRequest.current) return;
      if (r.error || !Array.isArray(r.data?.journeys) || !Array.isArray(r.data?.runs))
        throw new Error('load');
      setJourneys(r.data.journeys);
      setRuns(r.data.runs);
      setLoadError(false);
    } catch {
      if (request === listRequest.current) setLoadError(true);
    } finally {
      if (request === listRequest.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Load the authorized automation workspace.
    void load();
    const r = revision,
      l = listRequest,
      t = traceRequest;
    return () => {
      ++r.current;
      ++l.current;
      ++t.current;
    };
  }, [load]);
  function change() {
    ++revision.current;
    setDirty(true);
    setNotice(null);
  }
  function fresh() {
    ++revision.current;
    ++traceRequest.current;
    setSelected(null);
    setName('');
    setTrigger('0');
    setReentry('once_per_account');
    setStatus('draft');
    setGraph(initialJourney());
    setDirty(false);
    setConflict(false);
    setNotice(null);
    setTrace(null);
  }
  async function edit(journey: Journey) {
    const request = ++revision.current;
    ++traceRequest.current;
    setTrace(null);
    setBusy(true);
    setNotice(null);
    try {
      const r = await supabase.functions.invoke(
        `email-journeys?id=${encodeURIComponent(journey.id)}`,
        { method: 'GET' },
      );
      if (request !== revision.current) return;
      if (r.error || !r.data?.journey || !r.data?.version?.definition) throw new Error('detail');
      const v = r.data.version as Version;
      const index = journeyTriggers.findIndex(
        ([type, state]) => type === v.trigger_event && state === v.trigger_state,
      );
      if (index < 0) throw new Error('trigger');
      setSelected(r.data.journey);
      setName(r.data.journey.name);
      setStatus(r.data.journey.status);
      setGraph(v.definition);
      setTrigger(String(index));
      setReentry(v.reentry);
      setDirty(false);
      setConflict(false);
    } catch {
      if (request === revision.current)
        setNotice('Could not open this journey. Your current edits are preserved.');
    } finally {
      if (request === revision.current) setBusy(false);
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy || validation || conflict || !name.trim()) return;
    const request = revision.current;
    setBusy(true);
    setNotice(null);
    try {
      const r = await supabase.functions.invoke('email-journeys', {
        body: {
          action: 'save',
          name: name.trim(),
          definition: graph,
          trigger_event: event[0],
          trigger_state: event[1],
          reentry,
          status,
          ...(selected ? { id: selected.id, expected_version: selected.version } : {}),
        },
      });
      if (request !== revision.current) return;
      if (r.error) {
        const code = r.error.context?.status;
        if (code === 409) {
          setConflict(true);
          setNotice(
            'Another administrator changed this journey. Your edits are preserved. Reload the saved version or keep your edits as a new draft.',
          );
        } else
          setNotice(
            code === 503
              ? 'Delivery is not ready for activation. Keep this journey as a draft.'
              : 'Could not save this journey. Your edits are preserved. Check the trigger, connections and active welcome template, then retry.',
          );
        return;
      }
      if (!r.data?.journey?.id || !Number.isInteger(r.data.journey.version))
        throw new Error('save');
      setSelected({ name: name.trim(), ...r.data.journey });
      setDirty(false);
      setConflict(false);
      setNotice(`Journey saved as ${status}, version ${r.data.journey.version}.`);
      await load();
    } catch {
      if (request === revision.current)
        setNotice('Could not save this journey. Your edits are preserved; retry when ready.');
    } finally {
      if (request === revision.current) setBusy(false);
    }
  }
  function updateNode(id: string, node: JourneyNode) {
    change();
    setGraph({ ...graph, steps: { ...graph.steps, [id]: node } });
  }
  function addNode(type: JourneyNode['type']) {
    const steps = { ...graph.steps };
    let n = 1;
    while (Object.hasOwn(steps, `${type}_${n}`)) ++n;
    const id = `${type}_${n}`,
      next = Object.keys(steps).find((k) => steps[k].type === 'end') ?? graph.start;
    const node: JourneyNode =
      type === 'wait'
        ? { type, seconds: 60, next }
        : type === 'branch'
          ? { type, condition: 'profile_exists', yes: next, no: next }
          : type === 'welcome'
            ? { type, next }
            : { type };
    change();
    setGraph({ ...graph, steps: { ...steps, [id]: node } });
  }
  async function inspect(run: Run) {
    const request = ++traceRequest.current;
    setTrace(null);
    try {
      const r = await supabase.functions.invoke(
        `email-journeys?run_id=${encodeURIComponent(run.id)}`,
        { method: 'GET' },
      );
      if (request !== traceRequest.current) return;
      if (r.error || !r.data?.run || !Array.isArray(r.data?.steps)) throw new Error('trace');
      setTrace(r.data);
    } catch {
      if (request === traceRequest.current)
        setNotice('Could not load the run history. Retry when ready.');
    }
  }
  async function cancel(run: Run) {
    setBusy(true);
    try {
      const r = await supabase.functions.invoke('email-journeys', {
        body: { action: 'cancel', run_id: run.id },
      });
      if (r.error || r.data?.cancelled !== true) throw new Error('cancel');
      ++traceRequest.current;
      setTrace(null);
      setNotice('Run cancelled. Already submitted mail cannot be recalled.');
      await load();
    } catch {
      setNotice('Could not cancel this run. Refresh its current state before retrying.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-6 py-6" aria-label="Transactional journeys">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-sans text-title font-bold">Transactional journeys</h2>
          <p className="max-w-prose text-sm text-muted-foreground">
            Build a sequence, preview its paths and inspect each run. Existing runs keep the version
            they started with.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={busy || dirty} onClick={fresh}>
            New journey
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => void load()}>
            Refresh journeys
          </Button>
        </div>
      </div>
      {loadError && (
        <p role="alert">
          Could not load journeys. Use Refresh journeys to retry. Your edits are preserved.
        </p>
      )}
      {loading ? (
        <p role="status">Loading journeys…</p>
      ) : !journeys.length ? (
        <AdminEmpty noun="saved journeys" />
      ) : (
        <ul className="divide-y divide-border" aria-label="Saved journeys">
          {journeys.map((j) => (
            <li key={j.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
              <div>
                <strong>{j.name}</strong>
                <p className="text-sm text-muted-foreground">
                  {j.status} · Version {j.version}
                </p>
              </div>
              <Button variant="outline" disabled={busy || dirty} onClick={() => void edit(j)}>
                Edit {j.name}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {notice && (
        <p role="status" className="border border-border p-4 text-sm">
          {notice}
        </p>
      )}
      {conflict && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy} onClick={() => selected && void edit(selected)}>
            Reload saved version
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              ++revision.current;
              setSelected(null);
              setStatus('draft');
              setConflict(false);
              setDirty(true);
              setNotice(null);
            }}
          >
            Keep as new draft
          </Button>
        </div>
      )}
      <form
        onSubmit={save}
        className="space-y-6 border-t border-border pt-6"
        aria-label="Journey editor"
      >
        <fieldset disabled={busy} className="space-y-6">
          <legend className="mb-4 font-semibold">
            {selected ? `Edit ${selected.name}` : 'Create a journey'}
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor={`${uid}-name`}>Journey name</Label>
              <Input
                id={`${uid}-name`}
                value={name}
                maxLength={200}
                required
                onChange={(e) => {
                  change();
                  setName(e.target.value);
                }}
              />
            </div>
            <div>
              <Label htmlFor={`${uid}-trigger`}>Start when</Label>
              <select
                id={`${uid}-trigger`}
                value={trigger}
                className={selectStyle}
                onChange={(e) => {
                  change();
                  setTrigger(e.target.value);
                }}
              >
                {journeyTriggers.map((t, i) => (
                  <option key={t.join(':')} value={i}>
                    {t[2]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor={`${uid}-reentry`}>Re-entry</Label>
              <select
                id={`${uid}-reentry`}
                value={reentry}
                className={selectStyle}
                onChange={(e) => {
                  change();
                  setReentry(e.target.value);
                }}
              >
                <option value="once_per_account">Once per account</option>
                <option value="once_per_source">Once per source record</option>
                <option value="per_event">Each qualifying event</option>
              </select>
            </div>
            <div>
              <Label htmlFor={`${uid}-status`}>Publication state</Label>
              <select
                id={`${uid}-status`}
                value={status}
                className={selectStyle}
                onChange={(e) => {
                  change();
                  setStatus(e.target.value as Journey['status']);
                }}
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>
          <p className="max-w-prose text-sm text-muted-foreground">
            Active journeys enroll new matching events. Draft and paused journeys hold unfinished
            work. Archiving cancels unfinished runs. Activation does not enroll historical accounts.
          </p>
          <div className="max-w-sm">
            <JourneyTarget
              id={`${uid}-start`}
              value={graph.start}
              steps={Object.keys(graph.steps)}
              label="Starting step"
              onChange={(start) => {
                change();
                setGraph({ ...graph, start });
              }}
            />
          </div>
          <ol className="divide-y divide-border border-y border-border" aria-label="Journey steps">
            {Object.entries(graph.steps).map(([key, node]) => (
              <li key={key} className="space-y-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <h3 className="font-semibold">
                    {key}{' '}
                    <span className="font-normal text-muted-foreground">
                      · {node.type === 'welcome' ? 'Account welcome' : node.type}
                    </span>
                  </h3>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={Object.keys(graph.steps).length === 1}
                    onClick={() => {
                      const steps = { ...graph.steps };
                      delete steps[key];
                      change();
                      setGraph({ ...graph, steps });
                    }}
                  >
                    Remove {key}
                  </Button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {node.type === 'wait' && (
                    <div>
                      <Label htmlFor={`${uid}-${key}-seconds`}>Wait in seconds</Label>
                      <Input
                        id={`${uid}-${key}-seconds`}
                        type="number"
                        min={1}
                        max={2592000}
                        step={1}
                        value={node.seconds}
                        onChange={(e) =>
                          updateNode(key, { ...node, seconds: Number(e.target.value) })
                        }
                      />
                    </div>
                  )}
                  {node.type === 'branch' ? (
                    <>
                      <div className="sm:col-span-2">
                        <Label htmlFor={`${uid}-${key}-condition`}>Continue based on</Label>
                        <select
                          id={`${uid}-${key}-condition`}
                          className={selectStyle}
                          value={node.condition}
                          onChange={(e) =>
                            updateNode(key, {
                              ...node,
                              condition: e.target.value as 'profile_exists' | 'username_claimed',
                            })
                          }
                        >
                          <option value="profile_exists">Profile exists</option>
                          <option value="username_claimed">Username is claimed</option>
                        </select>
                      </div>
                      <JourneyTarget
                        id={`${uid}-${key}-yes`}
                        value={node.yes}
                        steps={Object.keys(graph.steps)}
                        label="If yes, go to"
                        onChange={(yes) => updateNode(key, { ...node, yes })}
                      />
                      <JourneyTarget
                        id={`${uid}-${key}-no`}
                        value={node.no}
                        steps={Object.keys(graph.steps)}
                        label="If no, go to"
                        onChange={(no) => updateNode(key, { ...node, no })}
                      />
                    </>
                  ) : (
                    node.type !== 'end' && (
                      <JourneyTarget
                        id={`${uid}-${key}-next`}
                        value={node.next}
                        steps={Object.keys(graph.steps)}
                        label="Then go to"
                        onChange={(next) => updateNode(key, { ...node, next })}
                      />
                    )
                  )}
                </div>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2">
            {(['wait', 'branch', 'welcome', 'end'] as const).map((type) => (
              <Button
                key={type}
                type="button"
                variant="outline"
                disabled={
                  Object.keys(graph.steps).length >= 32 ||
                  (type === 'welcome' && event[0] !== 'account.created')
                }
                onClick={() => addNode(type)}
              >
                Add {type === 'welcome' ? 'account welcome' : type}
              </Button>
            ))}
          </div>
          {validation && (
            <p role="alert" className="text-sm">
              {validation}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-4">
            <Button type="submit" disabled={busy || !!validation || conflict || !name.trim()}>
              {busy ? 'Saving…' : 'Save journey'}
            </Button>
            {dirty && (
              <Button
                type="button"
                variant="outline"
                onClick={() => (selected ? void edit(selected) : fresh())}
              >
                Discard edits
              </Button>
            )}
            <span className="text-sm text-muted-foreground">
              {dirty
                ? 'Unsaved changes'
                : selected
                  ? `Saved version ${selected.version}`
                  : 'Not saved'}
            </span>
          </div>
        </fieldset>
      </form>
      <section
        className="space-y-4 border-t border-border pt-6"
        aria-label="Sample journey preview"
      >
        <h3 className="font-semibold">Preview a path</h3>
        <p className="text-sm text-muted-foreground">
          Uses a sample profile. No account is enrolled and no email is sent. Live runs recheck the
          source and current account state.
        </p>
        <div className="flex flex-wrap gap-6">
          {(['profile_exists', 'username_claimed'] as const).map((key) => (
            <label key={key} className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={sample[key]}
                onChange={(e) => setSample({ ...sample, [key]: e.target.checked })}
              />
              {key === 'profile_exists' ? 'Profile exists' : 'Username is claimed'}
            </label>
          ))}
        </div>
        {!validation && (
          <ol className="space-y-2">
            {previewJourney(graph, sample).map((step) => (
              <li
                key={step.id}
                className="flex flex-wrap justify-between gap-2 border-b border-border py-2 text-sm"
              >
                <span>
                  <strong>{step.id}</strong> · {step.outcome}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  After {step.elapsed} seconds
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
      <section className="space-y-4 border-t border-border pt-6" aria-label="Recent journey runs">
        <h3 className="font-semibold">Recent runs</h3>
        <p className="text-sm text-muted-foreground">
          Up to 100 recent runs. A run history records completed steps; a preview is not delivery
          evidence.
        </p>
        {!runs.length ? (
          <AdminEmpty noun="journey runs" />
        ) : (
          <ul className="divide-y divide-border">
            {runs.map((run) => (
              <li key={run.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                <div>
                  <strong>
                    {journeys.find((j) => j.id === run.journey_id)?.name ?? 'Journey'}
                  </strong>
                  <p className="text-sm text-muted-foreground">
                    Version {run.version} · {run.status} · {run.step_id}
                  </p>
                  {run.last_error && (
                    <p className="text-sm">{run.last_error.replaceAll('_', ' ')}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => void inspect(run)}>
                    Inspect run {run.id.slice(0, 8)}
                  </Button>
                  {['waiting', 'processing'].includes(run.status) && (
                    <Button variant="outline" disabled={busy} onClick={() => void cancel(run)}>
                      Cancel run {run.id.slice(0, 8)}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {trace && (
        <section aria-label="Run history" className="space-y-4 border-t border-border pt-4">
          <h3 className="font-semibold">Run history · {trace.run.id.slice(0, 8)}</h3>
          <p className="text-sm">
            {trace.run.status} · Version {trace.run.version} · Next check{' '}
            {new Date(trace.run.due_at).toLocaleString()}
          </p>
          {!trace.steps.length ? (
            <p className="text-sm">No steps have completed.</p>
          ) : (
            <ol className="space-y-2">
              {trace.steps.map((step) => (
                <li key={step.step_id} className="text-sm">
                  {step.step_id} · {step.kind} · {step.outcome} ·{' '}
                  {new Date(step.completed_at).toLocaleString()}
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </section>
  );
}
