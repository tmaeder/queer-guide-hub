import type { TagHygieneStats } from '@/hooks/useTagHygieneStats';

/**
 * Presentation metadata for the counters `tag_hygiene_stats()` returns.
 *
 * Lives outside the panel component so it can be pinned by
 * `src/lib/__tests__/tagHygienePanelMetrics.test.ts` without exporting a
 * non-component from a component module.
 */
type MetricKey = Exclude<keyof TagHygieneStats, 'totals'>;

export interface HygieneMetric {
  key: MetricKey;
  label: string;
  /**
   * Advisory metrics WARN in CI instead of failing it — they drift from writers
   * outside the tag glossary. This panel is the only place a human sees them,
   * which is why the set is duplicated here rather than inferred: a drift test
   * pins it to `_advisory` in scripts/tag-hygiene-baseline.json.
   */
  advisory?: true;
  /**
   * Turns the figure destructive on any non-zero value. Set exactly when the
   * committed baseline for this counter is 0, and pinned to it by the drift
   * test — a counter whose accepted level is a documented non-zero constant
   * (`duplicate_active_name` 14, the marketplace facet vocabulary colliding
   * with the glossary by design; `redirect_to_non_canonical` 58 inert
   * accent-folding rows) would otherwise render permanently red, which teaches
   * admins to ignore red.
   */
  zero?: true;
  hint?: string;
}

export const HYGIENE_METRICS: HygieneMetric[] = [
  // Hard gates: CI fails when any of these grows past the committed baseline.
  { key: 'assignment_to_non_active_tag', label: 'Assignments to dead tags', zero: true },
  { key: 'dangling_category_id', label: 'Dangling category id', zero: true },
  { key: 'nonclean_entity_type', label: 'Unnormalized entity_type', zero: true },
  {
    key: 'active_tags_with_image_url',
    label: 'Photos on active tags',
    zero: true,
    hint: 'Glossary photography retired 2026-08-28 (tags render drawn TagPlates). Non-zero means a writer is reintroducing photos.',
  },
  { key: 'indexable_without_description', label: 'Indexable, no prose', zero: true },
  { key: 'merged_but_not_status_merged', label: 'Merged but still active', zero: true },
  {
    key: 'placeholder_description_active',
    label: 'Placeholder as definition',
    hint: 'A bulk-import stamp ("Sexual activity tag", "Toys tag") published as the lead paragraph. Invisible to "Indexable, no prose", which only sees an EMPTY description.',
  },
  {
    key: 'duplicate_active_name',
    label: 'Duplicate active names',
    hint: 'Facet slugs (color-black, genre-history) may share a display name with a glossary tag by design.',
  },
  {
    key: 'redirect_to_non_canonical',
    label: 'Redirects to non-canonical',
    hint: 'Inert, not live 301-into-404s — the edge lookup filters redirect targets on status=active.',
  },
  {
    key: 'alias_equals_name',
    label: 'Alias equals tag name',
    zero: true,
    hint: '"Also called: Festival" on /tags/festival asserts nothing. 47 deleted 2026-08-29; a comeback means the sitelink importer regressed.',
  },
  {
    key: 'alias_mojibake',
    label: 'Mojibake aliases',
    zero: true,
    hint: 'U+FFFD in an alias is transport corruption, never a spelling.',
  },
  {
    key: 'refusal_prose_active',
    label: 'Refusal prose as definition',
    zero: true,
    hint: '"No information available" stamps and LLM refusal essays published as definitions. A blank is honest and gets deindexed; these read as content.',
  },

  // Advisory: CI warns, never fails. This panel is their only human surface.
  {
    key: 'denorm_category_missing',
    label: 'Category not denormalized',
    advisory: true,
    hint: 'A queue depth, not an invariant. Approving a category writes the junction and leaves the denorm to the nightly tag_category_resync — read the trend, not the value.',
  },
  {
    key: 'unreviewed_typed_alias',
    label: 'Typed aliases awaiting review',
    advisory: true,
    hint: 'Displayed nowhere, trusted by nothing until approved. Review in the tag editor; ordinary-word street names (Speed, Acid) stay unapproved on purpose.',
  },
  {
    key: 'relations_pending_review',
    label: 'Relations awaiting review',
    advisory: true,
    hint: 'LLM-verified ontology proposals + legacy co-occurrence rows. A related chip is an editorial assertion; nothing here displays until approved.',
  },
  {
    key: 'prose_unreviewed',
    label: 'Prose not yet truth-checked',
    advisory: true,
    hint: 'The mode=prose pass drains ~300/day (subject check + house-voice rewrite). Read the trend.',
  },
  {
    key: 'events_with_tags_unlinked',
    label: 'Events not linked to tags',
    advisory: true,
    hint: 'Drain gauge for run_event_tag_link. Must fall to 0 and stay there; a flat number means the job stopped.',
  },
  {
    key: 'uncategorized_active',
    label: 'Uncategorized',
    advisory: true,
    hint: 'A sawtooth, not a level — tag-enrichment-sweep drains it every two hours. Read the trend, not the value.',
  },
  {
    key: 'sensitive_without_description',
    label: 'Sensitive, no description',
    advisory: true,
    hint: 'A bare label on a public page, which is where context matters most. Actionable.',
  },
  {
    key: 'event_tag_strings_unresolved',
    label: 'Event tag strings unresolved',
    advisory: true,
    hint: 'Free-text event tags that match no tag name or slug. Phase 4 scope marker, German-heavy.',
  },
];
