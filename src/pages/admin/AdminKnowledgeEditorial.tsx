import { AdminEmpty } from '@/components/admin/primitives/AdminEmpty';
import { KnowledgeFigure } from '@/components/knowledge/KnowledgeFigure';
import { pilotFigure, PILOT_FIGURES } from '@/components/tags/infographics/registry';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import DOMPurify from 'dompurify';
import { useKnowledgeEditorial } from '@/hooks/knowledge/useKnowledgeEditorial';
import {
  editorialPath,
  proposalProblems,
  EDITORIAL_DIMENSIONS,
  type KnowledgeEntry,
  type KnowledgeProposal,
  type KnowledgeBatch,
} from '@/lib/knowledge/editorial';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { TrackLoader } from '@/components/transit/TrackLoader';

export default function AdminKnowledgeEditorial() {
  const query = useKnowledgeEditorial();
  const [params, setParams] = useSearchParams();
  const [message, setMessage] = useState('');
  const [filter, setFilter] = useState('all');
  const selected = params.get('entry');
  const entries = query.data?.entries ?? [];
  const proposals = query.data?.proposals ?? [];
  const batch = query.data?.batches[0];
  const entry = entries.find((item) => item.id === selected);
  const proposal = proposals.find((item) => item.entry_id === selected);
  const busy = query.action.isPending || query.worker.isPending;
  async function run(action: string, id: string, payload: Record<string, unknown> = {}) {
    setMessage('');
    try {
      await query.action.mutateAsync({ action, id, payload });
      setMessage(`${action.replaceAll('_', ' ')} completed.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The action failed. Try again.');
    }
  }
  return (
    <div className="relative space-y-6 bg-background">
      <AdminPageHeader
        eyebrow={null}
        title="Knowledge editorial"
        subtitle="Research, improve and review the words and people in the knowledge base."
      />
      {query.isLoading ? (
        <TrackLoader />
      ) : query.error ? (
        <div role="alert">
          <p>Could not load the editorial queue: {query.error.message}</p>
          <Button onClick={() => query.refetch()}>Retry</Button>
        </div>
      ) : (
        <>
          {batch && (
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border-hairline pb-4">
              <p className="text-13">
                {batch.name} · {entries.length} entries ·{' '}
                {batch.accepted_at ? 'Pilot accepted' : 'Pilot in review'} · Automatic publication{' '}
                {batch.automatic_enabled ? 'on' : 'off'}
              </p>
              <Button
                variant="outline"
                disabled={busy || !batch.accepted_at || Boolean(batch.paused_reason)}
                onClick={() => run('automation', batch.id, { enabled: !batch.automatic_enabled })}
              >
                {batch.automatic_enabled ? 'Pause automation' : 'Enable automation'}
              </Button>
              {batch.paused_reason && <p role="alert">Paused: {batch.paused_reason}</p>}
            </div>
          )}
          {batch && <BatchReview batch={batch} busy={busy} run={run} />}
          <div className="grid gap-8 lg:grid-cols-[minmax(240px,1fr)_minmax(0,3fr)]">
            <aside aria-label="Editorial entries">
              <Label htmlFor="editorial-filter">Show entries</Label>
              <select
                id="editorial-filter"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                className="mt-2 mb-4 min-h-11 w-full border border-input bg-background px-4"
              >
                {[
                  'all',
                  'research',
                  'draft',
                  'review',
                  'approved',
                  'published',
                  'rejected',
                  'superseded',
                ].map((state) => (
                  <option key={state}>{state}</option>
                ))}
              </select>
              <div className="mb-4 lg:hidden">
                <Label htmlFor="editorial-entry">Selected entry</Label>
                <select
                  id="editorial-entry"
                  value={selected ?? ''}
                  onChange={(event) => setParams({ entry: event.target.value })}
                  className="mt-2 min-h-11 w-full border border-input bg-background px-4"
                >
                  <option value="">Choose an entry</option>
                  {entries.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
              <ul className="hidden divide-y divide-border-hairline lg:block">
                {entries
                  .filter(
                    (item) =>
                      filter === 'all' ||
                      (proposals.find((p) => p.entry_id === item.id)?.status ?? 'research') ===
                        filter,
                  )
                  .map((item) => {
                    const current = proposals.find((p) => p.entry_id === item.id);
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          aria-current={selected === item.id ? 'true' : undefined}
                          onClick={() => setParams({ entry: item.id })}
                          className={`min-h-11 w-full px-4 py-4 text-left focus-visible:outline focus-visible:outline-2 ${selected === item.id ? 'bg-foreground text-background' : 'hover:bg-muted'}`}
                        >
                          <span className="block font-bold">{item.name}</span>
                          <span className="text-13">
                            {item.pilot_group} · {current?.status ?? 'research'}
                          </span>
                        </button>
                      </li>
                    );
                  })}
              </ul>
              {entries.length === 0 && (
                <AdminEmpty
                  noun="pilot entries"
                  description="Import the frozen pilot manifest to begin."
                />
              )}
            </aside>
            <main className="min-w-0" aria-label="Entry review">
              {entry ? (
                <>
                  <div className="mb-6">
                    <h2 className="text-headline font-bold">{entry.name}</h2>
                    <p className="mt-2">{entry.reader_question}</p>
                    <Link
                      to={editorialPath(entry)}
                      className="mt-2 inline-block underline underline-offset-4"
                    >
                      Open published entry
                    </Link>
                  </div>
                  {entry.exception && (
                    <p className="mb-4 text-13">Research note: {entry.exception}</p>
                  )}
                  {proposal &&
                    query.data?.events?.find((event) => event.proposal_id === proposal.id) && (
                      <p role="alert" className="mb-6 text-13">
                        Last worker attempt:{' '}
                        {
                          query.data.events.find((event) => event.proposal_id === proposal.id)
                            ?.detail.reason
                        }
                      </p>
                    )}
                  {proposal ? (
                    <ProposalEditor
                      key={`${proposal.id}:${proposal.status}:${proposal.checked_at}`}
                      entry={entry}
                      proposal={proposal}
                      busy={busy}
                      run={run}
                      worker={async (action) => {
                        setMessage('');
                        try {
                          await query.worker.mutateAsync({ action, id: proposal.id });
                          setMessage(`${action} completed.`);
                        } catch (error) {
                          setMessage(error instanceof Error ? error.message : 'Worker failed');
                        }
                      }}
                    />
                  ) : (
                    <Button disabled={busy} onClick={() => run('create', entry.id)}>
                      Start draft
                    </Button>
                  )}
                </>
              ) : (
                <p className="py-12 text-muted-foreground">
                  Select an entry to see its research, draft and review checks.
                </p>
              )}
              {message && (
                <p role="status" className="mt-6 border-t border-border-hairline pt-4">
                  {message}
                </p>
              )}
            </main>
          </div>
        </>
      )}
    </div>
  );
}
function ProposalEditor({
  entry,
  proposal,
  busy,
  run,
  worker,
}: {
  entry: KnowledgeEntry;
  proposal: KnowledgeProposal;
  busy: boolean;
  run: (action: string, id: string, payload?: Record<string, unknown>) => Promise<void>;
  worker: (action: 'generate' | 'validate') => Promise<void>;
}) {
  const bodyField = entry.entity_type === 'unified_tags' ? 'long_description' : 'bio';
  const [summary, setSummary] = useState(
    proposal.patch.description ?? proposal.base_snapshot.description ?? '',
  );
  const [body, setBody] = useState(
    proposal.patch[bodyField] ?? proposal.base_snapshot[bodyField] ?? '',
  );
  const [note, setNote] = useState('');
  const [specialist, setSpecialist] = useState('');
  const [qualification, setQualification] = useState('');
  const [attested, setAttested] = useState(false);
  const [preview, setPreview] = useState(false);
  const [comparison, setComparison] = useState('draft');
  const [sourceText, setSourceText] = useState(JSON.stringify(proposal.sources, null, 2));
  const [sourceError, setSourceError] = useState('');
  const closed = ['published', 'rejected', 'superseded'].includes(proposal.status);
  const dirty =
    summary !== (proposal.patch.description ?? proposal.base_snapshot.description ?? '') ||
    body !== (proposal.patch[bodyField] ?? proposal.base_snapshot[bodyField] ?? '') ||
    sourceText !== JSON.stringify(proposal.sources, null, 2);
  const problems = proposalProblems(proposal);
  async function save() {
    try {
      const sources: unknown = JSON.parse(sourceText);
      if (!Array.isArray(sources)) throw new Error('Sources must be a JSON array.');
      setSourceError('');
      await run('save', proposal.id, {
        expected_updated_at: proposal.updated_at,
        patch: { description: summary, [bodyField]: body },
        sources,
      });
    } catch (error) {
      setSourceError(error instanceof Error ? error.message : 'Invalid sources');
    }
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={busy || closed || dirty}
          onClick={() => worker('generate')}
        >
          Research and draft
        </Button>
        <Button
          variant="outline"
          disabled={busy || closed || dirty}
          onClick={() => worker('validate')}
        >
          Check evidence and writing
        </Button>
        <Button variant="outline" onClick={() => setPreview(!preview)}>
          {preview ? 'Edit draft' : 'Preview and compare'}
        </Button>
      </div>
      {dirty && (
        <p role="status" className="text-13">
          Save your edits before running checks or publishing.
        </p>
      )}
      {preview ? (
        <div className="grid gap-8 xl:grid-cols-2">
          <div className="flex gap-4 xl:hidden" aria-label="Compare versions">
            <Button
              variant="outline"
              aria-pressed={comparison === 'draft'}
              onClick={() => setComparison('draft')}
            >
              Proposed text
            </Button>
            <Button
              variant="outline"
              aria-pressed={comparison === 'current'}
              onClick={() => setComparison('current')}
            >
              Current text
            </Button>
          </div>
          <section
            aria-label="Current text"
            className={comparison === 'draft' ? 'hidden xl:block' : 'block'}
          >
            <h3 className="mb-4 font-bold">Currently published</h3>
            <p>{proposal.base_snapshot.description}</p>
            <div
              className="qg-cms-body mt-4 whitespace-pre-line"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(proposal.base_snapshot[bodyField] ?? ''),
              }}
            />
          </section>
          <section
            aria-label="Draft preview"
            lang="en"
            className={comparison === 'current' ? 'hidden xl:block' : 'block'}
          >
            <h3 className="mb-4 font-bold">Proposed text</h3>
            <p>{summary}</p>
            <div
              className="qg-cms-body mt-4 whitespace-pre-line"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(body) }}
            />
            {entry.portrait && (
              <figure className="mt-6">
                <img
                  src={entry.portrait.url}
                  alt={entry.portrait.alt}
                  className="max-h-80 object-contain"
                />
                <figcaption className="mt-2 text-13">
                  {entry.portrait.caption} · {entry.portrait.attribution} · {entry.portrait.license}{' '}
                  · {entry.portrait.status}
                </figcaption>
              </figure>
            )}
            {entry.visual_ids.map((id) => {
              const figure = pilotFigure(id);
              return figure ? <KnowledgeFigure key={id} figure={figure} draft /> : null;
            })}
          </section>
        </div>
      ) : (
        <>
          <div>
            <Label htmlFor="knowledge-summary">Summary</Label>
            <Textarea
              id="knowledge-summary"
              value={summary}
              disabled={closed}
              onChange={(event) => setSummary(event.target.value)}
              className="mt-2"
            />
          </div>
          <div>
            <Label htmlFor="knowledge-body">Article text (plain text or semantic HTML)</Label>
            <Textarea
              id="knowledge-body"
              value={body}
              disabled={closed}
              onChange={(event) => setBody(event.target.value)}
              className="mt-2 min-h-96"
            />
          </div>
          <details>
            <summary className="cursor-pointer py-4 font-bold">Sources and claim evidence</summary>
            <p className="mb-4 text-13">
              Each source needs id, URL, title, publisher, kind and supports. Retrieval receipts are
              supplied by the worker.
            </p>
            <Textarea
              aria-label="Source evidence JSON"
              value={sourceText}
              disabled={closed}
              onChange={(event) => setSourceText(event.target.value)}
              className="min-h-64 font-mono text-13"
            />
            {sourceError && <p role="alert">{sourceError}</p>}
          </details>
          <Button disabled={busy || closed || !dirty} onClick={save}>
            Save draft
          </Button>
        </>
      )}
      <section aria-label="Editorial checks" className="border-t border-border-hairline pt-6">
        <h3 className="font-bold">Review checks</h3>
        {problems.length > 0 ? (
          <ul className="mt-4 list-disc space-y-1 pl-6 text-13">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-13">
            Evidence and writing checks passed. Editorial review is still required for this pilot.
          </p>
        )}
        <p className="mt-4 text-13">
          {EDITORIAL_DIMENSIONS.map((key) => `${key}: ${proposal.rubric[key] ?? '—'}/5`).join(
            ' · ',
          )}
        </p>
        {proposal.review_note && <p className="mt-4 text-13">{proposal.review_note}</p>}
      </section>
      {entry.portrait && (
        <section className="border-t border-border-hairline pt-6">
          <h3 className="font-bold">Portrait review</h3>
          <p className="mt-4 text-13">
            {entry.portrait.status} · {entry.portrait.license ?? 'Licence unresolved'} ·{' '}
            {entry.portrait.attribution ?? 'Creator unresolved'}
          </p>
          {entry.portrait.source_url && (
            <a
              className="mt-4 inline-block underline"
              href={entry.portrait.source_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Read image rights and source
            </a>
          )}
          {entry.portrait.status === 'candidate' && (
            <Button
              variant="outline"
              disabled={busy}
              className="mt-4"
              onClick={() =>
                run('approve_portrait', entry.id, { subject_and_rights_checked: true })
              }
            >
              Confirm subject and rights; approve portrait
            </Button>
          )}
        </section>
      )}
      {!closed && (
        <div className="space-y-4">
          <div>
            <Label htmlFor="knowledge-review-note">Review note</Label>
            <Textarea
              id="knowledge-review-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          <details>
            <summary className="cursor-pointer py-4 font-bold">
              Specialist review for health and safety
            </summary>
            <Label htmlFor="specialist-name">Reviewer name</Label>
            <Input
              id="specialist-name"
              value={specialist}
              onChange={(event) => setSpecialist(event.target.value)}
            />
            <Label htmlFor="specialist-qualification">Relevant qualification or role</Label>
            <Input
              id="specialist-qualification"
              value={qualification}
              onChange={(event) => setQualification(event.target.value)}
            />
            <label className="mt-4 flex min-h-11 items-center gap-4">
              <input
                type="checkbox"
                checked={attested}
                onChange={(event) => setAttested(event.target.checked)}
              />
              I confirm this specialist reviewed the complete draft and sources.
            </label>
          </details>
          <div className="flex flex-wrap gap-4">
            <Button
              disabled={busy || dirty || proposal.status !== 'review' || problems.length > 0}
              onClick={() =>
                run('approve', proposal.id, {
                  note,
                  specialist_name: specialist,
                  specialist_qualification: qualification,
                  specialist_attested: attested,
                })
              }
            >
              Approve draft
            </Button>
            <Button
              disabled={busy || dirty || proposal.status !== 'approved'}
              onClick={() => run('publish', proposal.id)}
            >
              Publish approved draft
            </Button>
            <Button
              variant="outline"
              disabled={busy || dirty}
              onClick={() => run('reject', proposal.id, { note })}
            >
              Reject draft
            </Button>
          </div>
        </div>
      )}
      {proposal.status === 'published' && (
        <Button variant="outline" disabled={busy} onClick={() => run('rollback', proposal.id)}>
          Restore previous text
        </Button>
      )}
      {closed && (
        <Button variant="outline" disabled={busy} onClick={() => run('create', entry.id)}>
          Start revision from live text
        </Button>
      )}
    </div>
  );
}

function BatchReview({
  batch,
  busy,
  run,
}: {
  batch: KnowledgeBatch;
  busy: boolean;
  run: (action: string, id: string, payload?: Record<string, unknown>) => Promise<void>;
}) {
  const [readers, setReaders] = useState('');
  const [accuracy, setAccuracy] = useState('');
  const [figures, setFigures] = useState(false);
  const [accessibility, setAccessibility] = useState(false);
  const [reason, setReason] = useState('');
  const [correction, setCorrection] = useState('');
  const [regression, setRegression] = useState('');
  const [audit, setAudit] = useState(false);
  return (
    <details className="border-b border-border-hairline pb-4">
      <summary className="cursor-pointer py-4 font-bold">
        Pilot acceptance and automation review
      </summary>
      <div className="grid gap-6 pt-4 md:grid-cols-2">
        <section className="space-y-4">
          <h2 className="font-bold">Record actual reader testing</h2>
          <Label htmlFor="pilot-readers">
            Participant references (five or more, comma-separated; use anonymous codes)
          </Label>
          <Input
            id="pilot-readers"
            value={readers}
            onChange={(event) => setReaders(event.target.value)}
          />
          <Label htmlFor="pilot-accuracy">Correct comprehension answers (%)</Label>
          <Input
            id="pilot-accuracy"
            type="number"
            min="0"
            max="100"
            value={accuracy}
            onChange={(event) => setAccuracy(event.target.value)}
          />
          <Button
            variant="outline"
            disabled={
              busy ||
              readers.split(',').filter((v) => v.trim()).length < 5 ||
              Number(accuracy) < 80 ||
              Number(accuracy) > 100
            }
            onClick={() =>
              run('record_reader_test', batch.id, {
                participants: [
                  ...new Set(
                    readers
                      .split(',')
                      .map((v) => v.trim())
                      .filter(Boolean),
                  ),
                ],
                accuracy: Number(accuracy) / 100,
              })
            }
          >
            Record reader results
          </Button>
          <label className="flex min-h-11 items-center gap-4">
            <input
              type="checkbox"
              checked={figures}
              onChange={(event) => setFigures(event.target.checked)}
            />
            All six figures have been reviewed.
          </label>
          <label className="flex min-h-11 items-center gap-4">
            <input
              type="checkbox"
              checked={accessibility}
              onChange={(event) => setAccessibility(event.target.checked)}
            />
            Desktop, mobile and accessibility checks passed.
          </label>
          <Button
            disabled={busy || !figures || !accessibility}
            onClick={() =>
              run('accept_batch', batch.id, {
                figures_reviewed: figures,
                mobile_accessibility_passed: accessibility,
              })
            }
          >
            Accept completed pilot
          </Button>
        </section>
        <section className="space-y-4">
          <h2 className="font-bold">Automatic publication audit</h2>
          <label className="flex min-h-11 items-center gap-4">
            <input
              type="checkbox"
              checked={audit}
              onChange={(event) => setAudit(event.target.checked)}
            />
            I reviewed the first twenty automatic publications.
          </label>
          <Button
            variant="outline"
            disabled={busy || !audit}
            onClick={() => run('audit_first_twenty', batch.id, { all_twenty_reviewed: audit })}
          >
            Record audit
          </Button>
          <Label htmlFor="pilot-error">Material factual error</Label>
          <Textarea
            id="pilot-error"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <Button
            variant="outline"
            disabled={busy || reason.trim().length < 10}
            onClick={() => run('report_error', batch.id, { reason })}
          >
            Report error and pause automation
          </Button>
          {batch.paused_reason && (
            <>
              <Label htmlFor="pilot-correction">Correction evidence reference</Label>
              <Input
                id="pilot-correction"
                value={correction}
                onChange={(event) => setCorrection(event.target.value)}
              />
              <Label htmlFor="pilot-regression">Regression test reference</Label>
              <Input
                id="pilot-regression"
                value={regression}
                onChange={(event) => setRegression(event.target.value)}
              />
              <Button
                variant="outline"
                disabled={busy || correction.length < 10 || regression.length < 10}
                onClick={() =>
                  run('resolve_error', batch.id, {
                    correction_reference: correction,
                    regression_reference: regression,
                  })
                }
              >
                Record correction
              </Button>
            </>
          )}
        </section>
      </div>
      <details className="mt-8">
        <summary className="cursor-pointer py-4 font-bold">Review all six draft figures</summary>
        <div className="grid gap-8 xl:grid-cols-2">
          {PILOT_FIGURES.map((figure) => (
            <KnowledgeFigure key={figure.id} figure={figure} draft />
          ))}
        </div>
      </details>
    </details>
  );
}
