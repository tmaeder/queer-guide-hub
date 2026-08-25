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
   * with the glossary by design; `redirect_to_non_canonical` 57 inert
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
  { key: 'commons_image_without_license', label: 'Commons image, no license', zero: true },
  { key: 'indexable_without_description', label: 'Indexable, no prose', zero: true },
  {
    key: 'merged_but_not_status_merged',
    label: 'Merged but still active',
    zero: true,
    hint: 'Ratcheted to 0 once 20260926110000 cleared community-center. Non-zero means a tag carries merged_into_id without status=merged.',
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

  // Advisory: CI warns, never fails. This panel is their only human surface.
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
  {
    key: 'image_without_license',
    label: 'Image, no license',
    advisory: true,
    hint: 'Mostly self-hosted images whose provenance was never captured and cannot be recovered. Ratchet, not a target.',
  },
  {
    key: 'image_alt_column_empty',
    label: 'Image, no alt column',
    advisory: true,
    hint: 'Not an accessibility gate — every render path already emits alt="" for these.',
  },
];
