import { useState } from 'react';
import { ArrowLeft, Check, ExternalLink, Pencil, SkipForward } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useAdminShell } from '@/components/admin/shell/AdminShell';
import { StructuredValue } from '@/components/admin/triage/StructuredDataView';
import { GovernanceSelectField } from '@/components/admin/triage/GovernanceFieldControls';
import { GOVERNANCE_SELECT_OPTIONS } from '@/components/admin/triage/governanceFieldControlUtils';
import {
  OWNERSHIP_VOCAB,
  SENSITIVE_TAGS,
  tagLabel,
} from '@/components/admin/review-queues/brandReviewVocab';
import {
  useReviewLookup,
  type ReviewItem,
  type ReviewLookupType,
  type ReviewDecision,
} from '@/hooks/useAdminReview';
import { VenueMatchPanel, type VenueMatchSelection } from './VenueMatchPanel';
import { isVenueMatchReview, reviewContract } from './reviewContracts';
import { ReviewEvidencePanel } from './ReviewEvidencePanel';

function Lookup({
  table,
  label,
  value,
  initialLabel,
  onChange,
}: {
  table: ReviewLookupType;
  label: string;
  value: string;
  initialLabel?: string;
  onChange: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const query = useReviewLookup(table, search, true);
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium" htmlFor={`review-lookup-${table}`}>
        {label}
      </label>
      <Input
        id={`review-lookup-${table}`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name (at least 2 characters)"
      />
      {query.isError && (
        <p role="alert" className="text-sm text-destructive">
          Search failed. Change the search to retry.
        </p>
      )}
      <select
        aria-label={`Choose ${label.toLowerCase()}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-element border border-input bg-background px-4 text-sm"
      >
        <option value="">Choose a result</option>
        {value && !query.data?.some((x) => x.id === value) && (
          <option value={value}>{initialLabel || 'Selected record'}</option>
        )}
        {query.data?.map((row) => (
          <option key={row.id} value={row.id}>
            {row.name}
          </option>
        ))}
      </select>
      {query.isFetching && (
        <p role="status" className="text-sm text-muted-foreground">
          Searching…
        </p>
      )}
      {query.data?.length === 0 && (
        <p className="text-sm text-muted-foreground">No matching records. Try another name.</p>
      )}
    </div>
  );
}

interface Props {
  item: ReviewItem;
  busy: boolean;
  error?: string;
  onDecision: (decision: ReviewDecision) => void;
  onSkip: () => void;
  onBack: () => void;
}
export function ReviewTaskDetail({ item, busy, error, onDecision, onSkip, onBack }: Props) {
  const { openEditor } = useAdminShell();
  const contract = reviewContract(item);
  const meta = item.meta ?? {};
  const venueMatch = isVenueMatchReview(item);
  const [venueSelection, setVenueSelection] = useState<VenueMatchSelection | null>(null);
  const [notes, setNotes] = useState('');
  const [description, setDescription] = useState(String(meta.draft_long ?? meta.description ?? ''));
  const [draftHook, setDraftHook] = useState(String(meta.draft_hook ?? ''));
  const [category, setCategory] = useState(
    String((meta.proposal as Record<string, unknown> | undefined)?.suggested ?? ''),
  );
  const [tags, setTags] = useState<string[]>(
    Array.isArray(meta.suggested_tags) ? (meta.suggested_tags as string[]) : [],
  );
  const proposedOrg = meta.org as { id?: string; name?: string } | undefined;
  const [orgId, setOrgId] = useState(proposedOrg?.id ?? '');
  const [adoptionChoice, setAdoptionChoice] = useState(proposedOrg?.id ? 'existing' : '');
  const [restoration, setRestoration] = useState('utility');
  const [locale, setLocale] = useState('de');
  const [role, setRole] = useState(String(meta.proposed_role_kind ?? ''));
  const [ontology, setOntology] = useState('none_applicable');
  const [cityId, setCityId] = useState('');
  const [countryId, setCountryId] = useState('');
  const [keepDistinct, setKeepDistinct] = useState(false);
  const [validation, setValidation] = useState('');
  const workflow = item.queue_type;
  const issue = String(meta.issue_code ?? '');
  const needsDescription =
    workflow === 'editorial' ||
    (workflow === 'tag-restoration' && restoration === 'article') ||
    (workflow === 'milestone-review' && meta.field === 'description') ||
    (workflow === 'tag-editorial' &&
      [
        'article_missing_description',
        'article_unreviewed_prose',
        'article_localisation_unreviewed',
      ].includes(issue));
  const tagPair = item.queue_type === 'tags' && Boolean(item.risk_flags?.approve_unsupported);
  const requiresConfirm =
    tagPair ||
    Boolean(item.risk_flags?.requires_confirm) ||
    (workflow === 'brand-ownership' &&
      tags.some((t) => (SENSITIVE_TAGS as readonly string[]).includes(t)));
  const needsEvidence =
    workflow === 'brand-ownership' && tags.length > 0 && !String(meta.evidence ?? '').trim();
  const editable = Boolean(
    item.entity_table && item.entity_id && item.entity_table !== 'cms_content',
  );
  const evidenceEntries = Object.entries(meta)
    .filter(([key]) => workflow !== 'editorial' || !['draft_long', 'draft_hook'].includes(key))
    .filter(
      ([key, value]) =>
        value != null &&
        ![
          'workflow',
          'tag_id',
          'place_id',
          'finding_id',
          'audit_id',
          'id',
          'entity_id',
          'milestone_id',
          'canonical_id',
          'duplicate_id',
          'created_at',
          'updated_at',
          'reviewer_id',
          'status',
          'review_case',
          'original_queue_type',
          'original_item_id',
          'description_i18n_candidates',
        ].includes(key),
    );

  function decide(action: 'approve' | 'reject') {
    if (busy) return;
    let problem = '';
    if (
      (contract.noteRequired ||
        (action === 'reject' && contract.rejectNeedsNote) ||
        (action === 'approve' && needsEvidence)) &&
      !notes.trim()
    )
      problem = 'Add an evidence or review note before saving this decision.';
    if (
      action === 'approve' &&
      workflow === 'org-link-review' &&
      (!adoptionChoice || (adoptionChoice === 'existing' && !orgId))
    )
      problem = 'Choose an existing business or explicitly choose to create a new one.';
    if (action === 'approve' && workflow === 'venue-category' && !category)
      problem = 'Choose a category before applying it.';
    if (
      action === 'approve' &&
      needsDescription &&
      description.trim().length < (issue === 'article_localisation_unreviewed' ? 20 : 30)
    )
      problem = 'Write a complete reviewed description before saving.';
    if (action === 'approve' && workflow === 'trip-geography' && !cityId && !countryId)
      problem = 'Choose the correct city or country before resolving.';
    if (action === 'approve' && workflow === 'editorial' && !draftHook.trim())
      problem = 'Write a reviewed hook before publishing this draft.';
    if (action === 'approve' && venueMatch && !venueSelection)
      problem = 'Compare and select a current catalogue venue before linking.';
    setValidation(problem);
    if (problem) return;
    onDecision({
      item,
      action,
      notes,
      // Clicking the decision button is the confirmation; the server still
      // requires the flag on risk-gated items, so it is sent with the action.
      confirm:
        (action === 'approve' || Boolean(item.risk_flags?.confirm_rejection)) && requiresConfirm,
      payload: {
        ...(venueMatch ? venueSelection : {}),
        city_id: cityId || null,
        country_id: countryId || null,
        organization_id: adoptionChoice === 'existing' ? orgId : null,
        category,
        tags,
        decision: workflow === 'tag-editorial' ? ontology : restoration,
        description,
        draft_hook: draftHook,
        draft_long: description,
        locale,
        role,
        keep_distinct: keepDistinct,
      },
    });
  }
  return (
    <section
      className="flex h-full min-h-0 flex-col bg-background"
      aria-label={`Review ${item.title}`}
    >
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-4 py-4 md:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="md:hidden"
            aria-label="Back to queue"
          >
            <ArrowLeft size={16} />
          </Button>
          <Badge variant={item.risk === 'safety' ? 'destructive' : 'secondary'}>
            {item.source_label}
          </Badge>
          {item.overdue && <span className="text-xs font-medium text-destructive">Overdue</span>}
        </div>
        {editable && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              openEditor(
                item.entity_table === 'tag' ? 'unified_tags' : item.entity_table!,
                item.entity_id,
              )
            }
          >
            <Pencil size={14} className="mr-1.5" />
            Edit record
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-6">
        <h2 className="break-words font-sans text-title font-bold leading-snug">{item.title}</h2>
        <p className="mt-2 break-words text-sm text-muted-foreground">
          {item.subtitle
            ? /^[a-zA-Z][a-zA-Z0-9_]*$/.test(item.subtitle)
              ? item.subtitle.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
              : item.subtitle
            : 'Review the evidence and choose the appropriate outcome.'}
        </p>
        {venueMatch && (
          <VenueMatchPanel
            item={item}
            busy={busy}
            selection={venueSelection}
            onSelect={setVenueSelection}
          />
        )}
        <ReviewEvidencePanel
          item={item}
          candidateOrganizationId={
            workflow === 'org-link-review'
              ? adoptionChoice === 'existing'
                ? orgId
                : null
              : undefined
          }
        />
        <div className="mt-6 border-y border-border py-4">
          <h3 className="text-sm font-semibold">Decision</h3>
          <p className="mt-1 max-w-prose text-sm leading-relaxed">{contract.consequence}</p>
          {contract.rejectConsequence && (
            <p className="mt-2 text-sm text-muted-foreground">
              {contract.reject}: {contract.rejectConsequence}
            </p>
          )}
        </div>
        <div className="mt-6 flex flex-col gap-6">
          <details className="border-y border-border py-4">
            <summary className="cursor-pointer text-sm font-semibold">
              Full proposal and detector details
            </summary>
            <div className="mt-4 space-y-6">
              {evidenceEntries.map(([key, value]) => (
                <div key={key}>
                  <h3 className="mb-2 text-sm font-medium">
                    {key === 'current_value'
                      ? 'Value at proposal time'
                      : key === 'proposed_value'
                        ? 'Proposed change'
                        : key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())}
                  </h3>
                  <StructuredValue value={value} />
                </div>
              ))}
            </div>
          </details>
          {workflow === 'org-link-review' && (
            <fieldset className="flex flex-col gap-4">
              <legend className="mb-2 text-sm font-semibold">Business to link</legend>
              <GovernanceSelectField
                value={adoptionChoice}
                ariaLabel="Business adoption strategy"
                onChange={setAdoptionChoice}
                options={[
                  { value: '', label: 'Choose how to link' },
                  { value: 'existing', label: 'Link an existing business' },
                  { value: 'new', label: 'Create a new business from this proposal' },
                ]}
              />
              {adoptionChoice === 'existing' && (
                <Lookup
                  table="organizations"
                  label="Business"
                  value={orgId}
                  initialLabel={proposedOrg?.name}
                  onChange={setOrgId}
                />
              )}
            </fieldset>
          )}
          {workflow === 'trip-geography' && (
            <>
              <Lookup table="cities" label="Destination city" value={cityId} onChange={setCityId} />
              <Lookup
                table="countries"
                label="Destination country"
                value={countryId}
                onChange={setCountryId}
              />
            </>
          )}
          {workflow === 'venue-category' && (
            <GovernanceSelectField
              value={category}
              ariaLabel="Venue category"
              onChange={setCategory}
              options={[
                { value: '', label: 'Choose a category' },
                ...(GOVERNANCE_SELECT_OPTIONS['venue-category'] ?? []),
              ]}
            />
          )}
          {workflow === 'brand-ownership' && (
            <fieldset>
              <legend className="mb-4 text-sm font-semibold">Ownership claims to publish</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                {OWNERSHIP_VOCAB.map((tag) => (
                  <label
                    key={tag}
                    htmlFor={`ownership-${tag}`}
                    className="flex min-h-10 items-center gap-4 text-sm"
                  >
                    <Checkbox
                      id={`ownership-${tag}`}
                      checked={tags.includes(tag)}
                      onCheckedChange={(checked) =>
                        setTags((old) => (checked ? [...old, tag] : old.filter((t) => t !== tag)))
                      }
                    />
                    {tagLabel(tag)}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {workflow === 'tag-restoration' && (
            <GovernanceSelectField
              value={restoration}
              ariaLabel="Restoration publication role"
              onChange={setRestoration}
              options={[
                { value: 'utility', label: 'Utility vocabulary (not indexed)' },
                { value: 'article', label: 'Reviewed glossary article' },
              ]}
            />
          )}
          {workflow === 'tag-editorial' && issue === 'article_ontology_unreviewed' && (
            <GovernanceSelectField
              value={ontology}
              ariaLabel="Ontology decision"
              onChange={setOntology}
              options={[
                { value: 'none_applicable', label: 'No relations apply' },
                { value: 'reviewed', label: 'Approved relations reviewed' },
              ]}
            />
          )}
          {workflow === 'tag-editorial' && issue === 'article_localisation_unreviewed' && (
            <GovernanceSelectField
              value={locale}
              ariaLabel="Translation language"
              onChange={setLocale}
              options={['de', 'fr', 'es', 'it', 'pt', 'nl', 'pl', 'ru', 'tr', 'uk', 'sv'].map(
                (value) => ({
                  value,
                  label: new Intl.DisplayNames(['en'], { type: 'language' }).of(value) ?? value,
                }),
              )}
            />
          )}
          {workflow === 'editorial' && (
            <label
              htmlFor="review-editorial-hook"
              className="flex flex-col gap-2 text-sm font-medium"
            >
              Reviewed hook
              <Textarea
                id="review-editorial-hook"
                value={draftHook}
                onChange={(e) => setDraftHook(e.target.value)}
              />
            </label>
          )}
          {needsDescription && (
            <label className="flex flex-col gap-2 text-sm font-medium">
              {issue === 'article_localisation_unreviewed'
                ? 'Reviewed translation'
                : 'Reviewed description'}
              <Textarea
                id="review-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-40 font-normal leading-relaxed"
              />
            </label>
          )}
          {workflow === 'milestone-links' && (
            <label htmlFor="review-role" className="flex flex-col gap-2 text-sm font-medium">
              Relationship role
              <Input id="review-role" value={role} onChange={(e) => setRole(e.target.value)} />
            </label>
          )}
          {workflow === 'tag-merges' && (
            <label htmlFor="review-distinct" className="flex min-h-10 items-center gap-4 text-sm">
              <Checkbox
                id="review-distinct"
                checked={keepDistinct}
                onCheckedChange={(v) => setKeepDistinct(v === true)}
              />
              When keeping separate, exclude this pair from future merge suggestions
            </label>
          )}
          <label htmlFor="review-note" className="flex flex-col gap-2 text-sm font-medium">
            Evidence or review note
            <Textarea
              id="review-note"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Explain your decision or cite the source you checked"
              className="min-h-24 font-normal"
            />
          </label>
          {typeof meta.sample_url === 'string' &&
            typeof meta.sample_url === 'string' &&
            /^https?:\/\//.test(meta.sample_url) && (
              <a
                href={meta.sample_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm underline underline-offset-4"
              >
                Open source
                <ExternalLink size={14} />
              </a>
            )}
        </div>
      </div>
      <footer className="shrink-0 border-t border-border bg-background px-4 py-4 md:px-6">
        {(error || validation) && (
          <p role="alert" className="mb-4 text-sm leading-relaxed text-destructive">
            {error || validation}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            data-review-action="approve"
            onClick={() => decide('approve')}
            disabled={busy || contract.approveDisabled || (venueMatch && !venueSelection)}
            className="min-h-10"
          >
            <Check size={16} className="mr-1.5" />
            {busy ? 'Saving…' : contract.approve}
          </Button>
          {!contract.rejectDisabled && (
            <Button
              variant="outline"
              data-review-action="reject"
              onClick={() => decide('reject')}
              disabled={busy}
              className="min-h-10"
            >
              {contract.reject}
            </Button>
          )}
          <Button variant="ghost" onClick={onSkip} disabled={busy} className="ml-auto min-h-10">
            <SkipForward size={15} className="mr-1.5" />
            Skip
          </Button>
        </div>
      </footer>
    </section>
  );
}
