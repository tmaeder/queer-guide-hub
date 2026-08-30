/**
 * CMS Type System
 * Central type definitions for the unified Content Management System.
 */

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { ZodTypeAny } from 'zod';

// ── Workflow & Visibility ──────────────────────────────────────────

export type WorkflowState = 'draft' | 'review' | 'published' | 'archived';
export type VisibilityLevel = 'public' | 'private' | 'restricted';
export type MediaRole = 'cover' | 'gallery' | 'attachment' | 'avatar' | 'thumbnail';

// ── Field Types ────────────────────────────────────────────────────

export type FieldType =
  | 'text'
  | 'textarea'
  | 'richtext'
  | 'number'
  | 'boolean'
  | 'select'
  | 'multiselect'
  | 'date'
  | 'datetime'
  | 'url'
  | 'email'
  | 'phone'
  | 'image'
  | 'images'
  | 'location'
  | 'tags'
  | 'json'
  | 'social_links'
  | 'city_autocomplete'
  | 'country_autocomplete'
  | 'unified_tag'
  | 'venue_autocomplete'
  | 'profession_autocomplete'
  | 'roles_autocomplete'
  | 'link_list';

export type FieldGroup =
  | 'basic'
  | 'details'
  | 'location'
  | 'media'
  | 'seo'
  | 'settings'
  | 'lgbtq'
  | 'external';

export interface SelectOption {
  value: string;
  label: string;
}

export interface FieldConfig {
  /** DB column name */
  name: string;
  /** Display label */
  label: string;
  /** Field type */
  type: FieldType;
  /** Required for form submission */
  required?: boolean;
  /** UI group/section */
  group: FieldGroup;
  /** Placeholder text */
  placeholder?: string;
  /** Help text */
  helpText?: string;
  /** Options for select/multiselect */
  options?: SelectOption[];
  /** Default value */
  defaultValue?: unknown;
  /** Read-only (computed or system field) */
  readOnly?: boolean;
  /** Hidden from editor UI */
  hidden?: boolean;
  /**
   * Hide this field unless the predicate holds for the current form values.
   *
   * `hidden` is static; this is the conditional form. Redirects are the case
   * that needed it: a SHORT redirect has a `slug`, a PATH redirect has a
   * `source_path`, and showing both for every row is worse than the bespoke
   * form it replaces.
   *
   * A field hidden this way is also exempt from `required`, so a rule that only
   * applies to one shape cannot block saving the other.
   */
  visibleWhen?: (values: Record<string, unknown>) => boolean;
  /** Searchable in list view */
  searchable?: boolean;
  /** Sortable in list view */
  sortable?: boolean;
  /** Filterable in list view */
  filterable?: boolean;
  /** Show as a column in the admin list view */
  listColumn?: boolean;
  /**
   * Custom cell renderer for the list view. Receives the full row (incl. joined
   * relations from `ContentTypeConfig.listSelect`). When omitted the default
   * by-type renderer reads `row[field.name]`.
   */
  listRender?: (row: Record<string, unknown>) => ReactNode;
  /**
   * Marks a field as virtual (computed/joined, no backing DB column on the
   * primary table). Virtual fields are skipped during server-side filter/sort
   * even if `filterable`/`sortable` is true, are never included in a save
   * payload, and are not inline-editable.
   *
   * This is load-bearing, not documentation: a non-virtual field whose name has
   * no matching column makes PostgREST reject the whole write with PGRST204.
   * `fieldColumnTypes.test.ts` fails CI on exactly that shape, so reach for this
   * flag only when the field genuinely has no column (a picker that writes an FK
   * through `relatedFields`, or a value read from a `listSelect` join) — never to
   * silence the guard on a field that is simply pointing at the wrong column.
   */
  virtual?: boolean;
  /**
   * For `select`-typed filters: load options at runtime from a related table.
   * Replaces the static `options` list at filter render time.
   */
  dynamicOptions?: {
    table: string;
    valueColumn: string;
    labelColumn: string;
    orderBy?: string;
  };
  /** Max length for text fields */
  maxLength?: number;
  /** Min length for text fields */
  minLength?: number;
  /** Min value for number fields */
  min?: number;
  /** Max value for number fields */
  max?: number;
  /** Column span in grid (1 or 2) */
  colSpan?: 1 | 2;
  /**
   * Related FK fields auto-populated when this field changes.
   * Used by address/location fields to auto-resolve city_id/country_id.
   * Format: { city_id?: string; country_id?: string; city?: string; country?: string; ... }
   * Keys = target field names, values = source component keys.
   */
  relatedFields?: Record<string, string>;
  /**
   * Resolver type for smart auto-completion.
   * - 'address': full address → city, country, city_id, country_id
   * - 'nationality': demonym/country name → country_id
   * - 'birthplace': "City, Country" → city_id, country_id
   */
  resolverType?: 'address' | 'nationality' | 'birthplace';
}

// ── Content Type Registry ──────────────────────────────────────────

/**
 * A column offered in the bulk-edit menu when rows are selected.
 *
 * Distinct from the publish/archive/translate actions, which write workflow
 * metadata. This writes a real column on the entity table — the thing
 * AdminDataTable could do and the registry could not, which was the last
 * capability keeping pages on the other shell.
 */
export interface ContentBulkEditField {
  /** Column name on `tableName`. */
  name: string;
  label: string;
  type: 'boolean' | 'select';
  /** Required for `select`. */
  options?: SelectOption[];
}

/** A per-row action rendered in the content list beside Edit. */
export interface ContentRowAction {
  id: string;
  /** Tooltip text; also the accessible name, so write it for a screen reader. */
  label: string;
  icon: LucideIcon;
  /** Hide the action for rows it does not apply to. Defaults to always shown. */
  visible?: (row: Record<string, unknown>) => boolean;
  onSelect: (row: Record<string, unknown>) => void;
}

/**
 * Declares how a content type can be archived, restored and deleted.
 *
 * Archive semantics are PER ENTITY on purpose. This schema has three
 * conventions and each means something the others do not — a
 * `presumed_closed` venue is a live business we believe has shut, a `ghost`
 * city is not a place at all, and `review_status='archived'` is an editorial
 * judgement. The `archive_entity` / `restore_entity` dispatchers hold that
 * per-type SQL; this block tells the ADMIN LIST which column to read so it can
 * show the right badge and filter, without duplicating the semantics.
 *
 * Omit `archive` entirely for a type that must not offer one. Exactly ONE does:
 * `countries`. Hotels, news_articles and community_groups were also omitted
 * until 20261028100000 gave them an `archived_at` — they simply had no column,
 * only `seo_indexable`, which governs crawlers rather than the site, so an
 * Archive button would have deindexed without hiding.
 *
 * Countries are different and permanent: the blocker is not a missing column
 * but that `countries` is a PARENT. 246 of 250 have dependent
 * cities/venues/events, every child page embeds the parent for its name and
 * legal status, and `location_is_high_risk()` resolves the safety gate through
 * the same row — so archiving one would silently un-gate content in a
 * criminalizing jurisdiction. See the block comment in `country.ts`.
 */
export interface ContentLifecycleConfig {
  /** `p_type` for archive_entity / restore_entity / delete_entity. */
  type: string;
  /**
   * The column and value that mean "archived" for this type, so the list can
   * render state and filter without knowing the per-type rules. Omit to
   * declare the type deletable but not archivable.
   */
  archive?: {
    column: string;
    /**
     * Value written when archived, for the `equals` predicate. Omit when
     * `predicate` is `'present'`.
     */
    value?: string;
    /**
     * How to read `column`. `'equals'` (the default) compares against `value`
     * and covers the status-enum conventions already in the schema —
     * `review_status='archived'`, `shell_status='ghost'`, `status='cancelled'`.
     * `'present'` means "archived iff this column is non-null", for the
     * `archived_at` timestamp hotels/news/groups carry, where the useful fact
     * is WHEN rather than a sentinel string.
     */
    predicate?: 'equals' | 'present';
    /** Human label for the filter and badge, e.g. "Archived", "Ghost". */
    label?: string;
  };
  /** Hard delete available from the list. Defaults to true when this block exists. */
  deletable?: boolean;
}

export interface ContentTypeConfig {
  /** Unique ID matching the source table (e.g., 'venues', 'events') */
  id: string;
  /** Database table name */
  tableName: string;
  /**
   * RPC that owns creation for this type, instead of a plain insert into
   * `tableName`.
   *
   * Set this when the table has an identity problem a unique index cannot
   * express, so that "does this already exist?" is answered in one place rather
   * than re-implemented per writer. `cities` is the case it was added for:
   * every unique key on that table keys on the string, so an exonym
   * ("Kapstadt" beside "Cape Town") passes every constraint and lands as a
   * second row. `city_resolve_or_create` probes aliases, Wikidata QID and both
   * total unique keys, and refuses rather than guessing when two candidates
   * are equally plausible.
   *
   * The RPC must return at least `{ city_id | id, action, reason }`; `action`
   * of 'refused' is surfaced to the editor as a save error with the reason,
   * never silently swallowed.
   */
  createRpc?: {
    /** Postgres function name. */
    fn: string;
    /** Maps the editor's form values to the RPC's arguments. */
    args: (saveData: Record<string, unknown>) => Record<string, unknown>;
  };
  /** Primary key column (usually 'id') */
  primaryKey: string;
  /** Column used as title in lists */
  titleField: string;
  /** Column used as description/subtitle in lists */
  descriptionField?: string;
  /** Column used as image in lists */
  imageField?: string;
  /** Icon component */
  icon: LucideIcon;
  /** Display labels */
  label: { singular: string; plural: string };
  /** Theme color for badges/icons */
  color: string;
  /** Field definitions for the editor */
  fields: FieldConfig[];
  /**
   * Postgres select string used by the list view (Supabase syntax). Defaults to
   * `'*'`. Override to fetch joined relations and aggregate counts that virtual
   * `listRender` columns can read from. Example:
   * `'*,countries(name,equality_score),venues(count)'`.
   */
  listSelect?: string;
  /** Default values for new items */
  defaults?: Record<string, unknown>;
  /** Custom validator function */
  validate?: (
    data: Record<string, unknown>,
  ) => import('@/utils/contentValidation').ValidationResult;
  /** Whether this content type supports rich text body */
  hasRichText?: boolean;
  /** Default field groups order */
  fieldGroupOrder?: FieldGroup[];
  /** Zod schema for validation; overrides field-level rules when present. Auto-generated from fields if absent. */
  validation?: ZodTypeAny;
  /** Field names that participate in i18n via content_translations sidecar. */
  translatableFields?: string[];
  /** AI authoring assist config — which ops are available for this type. */
  aiAssist?: AIAssistConfig;
  /** Per-type workflow defaults. */
  workflow?: ContentTypeWorkflowConfig;
  /** Whether this type supports threaded comments (review/moderation). */
  commentable?: boolean;
  /** Initial sort for the admin list view (overridable by user). */
  defaultSort?: { field: string; dir: 'asc' | 'desc' };
  /**
   * Extra non-field panels appended to the AdminFullEditSheet accordion —
   * escape hatch for relation editors (e.g. milestone_links) that don't map to
   * a single column. Each panel owns its own data fetching + mutation.
   */
  extraPanels?: Array<{
    id: string;
    label: string;
    render: (contentId: string) => ReactNode;
  }>;
  /**
   * Per-row actions in the list, beside Edit.
   *
   * The reason this exists: pages still on `AdminDataTable` (redirects, tags)
   * carry `rowActions` — e.g. redirects has a live "test this redirect" that
   * opens the edge function — and the registry had no equivalent. Converting
   * them would have traded working tooling for revisions, so they stayed on the
   * other shell. This closes that gap.
   *
   * Deliberately narrower than `AdminTableConfig['rowActions']`: no bulk or
   * toolbar variants until something needs them.
   */
  rowActions?: ContentRowAction[];
  /**
   * Archive / restore / delete capability. Omit entirely for a type the admin
   * must not remove from this screen. See `ContentLifecycleConfig`.
   */
  lifecycle?: ContentLifecycleConfig;
  /**
   * Columns editable across selected rows. Rendered in the bulk bar beside the
   * workflow actions. Omit for types where mass-editing a column is not safe.
   */
  bulkEditFields?: ContentBulkEditField[];
  /**
   * Extra buttons in the list header, left of Export and New.
   *
   * The remaining `AdminDataTable` pages each carry a couple of these — an
   * import dialog, a bespoke export — and it was the last thing keeping
   * `AdminRedirects` off the registry.
   *
   * A render function rather than a node so the config stays a static object:
   * anything needing React state (a dialog) owns it inside the returned
   * component, not in the config.
   */
  toolbarActions?: () => ReactNode;
  /**
   * Admin companion surfaces for this type — single source for the entity tab
   * strip (List / Quality / Duplicates / Requests), palette entity search, and
   * the "All content" aggregate list. Replaces per-component hardcoded maps.
   */
  admin?: AdminCompanionConfig;
  /**
   * Public front-end path for a row, used by the editor live-preview iframe.
   * Return null when the row has no public page yet (e.g. no slug). Path is
   * locale-prefixed and `?preview=1`-appended by the PreviewPanel.
   */
  publicPath?: (row: Record<string, unknown>) => string | null;
}

export interface AdminCompanionConfig {
  /** Quality/review companion page route (entity tab strip). */
  qualityRoute?: string;
  /** Duplicates companion page route. */
  duplicatesRoute?: string;
  /** Requests companion page route (e.g. group join requests). */
  requestsRoute?: string;
  /** `search_documents` content_type for command-palette entity search. */
  searchType?: string;
  /** Include in the "All content" aggregate list. Default true. */
  includeInAllContent?: boolean;
  /**
   * Duplicate-review + merge capability. When set, the type appears in the
   * registry-driven `/admin/duplicates` console and gets a Duplicates tab.
   */
  dedup?: DedupCapability;
}

/**
 * Declares how the generic `/admin/duplicates` console detects + merges
 * duplicates for one content type. `find_duplicate_clusters` is generic over
 * `search_documents.entity_type`, and the `merge_entities` dispatcher is generic
 * over `p_type`, so most types need only this config — no bespoke UI.
 */
export interface DedupCapability {
  /** `search_documents.entity_type` (also the `merge_entities` p_type), e.g. 'venue'. */
  searchType: string;
  /** Table holding the canonical-suggestion columns. */
  metaTable: string;
  /** PostgREST select for the meta fetch (quality_score/is_featured/created_at/images). */
  metaCols: string;
  /** Which merge-RPC family this type uses. */
  mergePath: 'venue' | 'city' | 'entities';
  /** Optional retroactive fuzzy-cluster finder RPC (same-place / same-item review). */
  fuzzyRpc?: string;
  /** Optional bulk same-place auto-merge sweep RPC (venues today). */
  autoMergeRpc?: string;
  /** Override the generic clusterer for types not in `search_documents` (e.g. hotels). */
  clusterFinder?: string;
}

export type AIAssistOp =
  | 'summarize'
  | 'translate'
  | 'alt_text'
  | 'seo_draft'
  | 'auto_tag'
  | 'fact_check'
  | 'quality_review';

export interface AIAssistConfig {
  ops: AIAssistOp[];
  /** Fields the AI is allowed to write to. Output is Zod-validated before apply. */
  writableFields?: string[];
}

export interface ContentTypeWorkflowConfig {
  /** Skip review and publish directly when an admin saves. */
  autoPublish?: boolean;
  /** Force review even for admins (e.g. community-submitted types). */
  requiresReview?: boolean;
  /** Default visibility for newly created items. */
  defaultVisibility?: VisibilityLevel;
}

// ── Content Items ──────────────────────────────────────────────────

export interface ContentItem {
  id: string;
  sourceTable: string;
  title: string;
  description?: string;
  imageUrl?: string;
  workflowState?: WorkflowState;
  visibilityLevel?: VisibilityLevel;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  /** Raw data from source table */
  data: Record<string, unknown>;
}

// ── CMS Metadata (bridges source tables to CMS features) ──────────

export interface CMSContentMetadata {
  id: string;
  source_table: string;
  source_id: string;
  workflow_state: WorkflowState;
  visibility_level: VisibilityLevel;
  published_at?: string;
  published_by?: string;
  scheduled_publish_at?: string;
  scheduled_unpublish_at?: string;
  meta_title?: string;
  meta_description?: string;
  canonical_url?: string;
  last_edited_by?: string;
  last_edited_at?: string;
  locked_by?: string;
  locked_at?: string;
  editor_notes?: string;
  created_at: string;
  updated_at: string;
}

// ── Revisions ──────────────────────────────────────────────────────

export interface CMSRevision {
  id: string;
  source_table: string;
  source_id: string;
  revision_number: number;
  snapshot: Record<string, unknown>;
  changes?: Record<string, { old: unknown; new: unknown }>;
  change_summary?: string;
  created_by?: string;
  created_at: string;
  workflow_state?: WorkflowState;
  /** Joined author info */
  author?: {
    email?: string;
    display_name?: string;
  };
}

// ── Review Comments ────────────────────────────────────────────────

export type CommentType = 'comment' | 'approval' | 'rejection' | 'change_request';

export interface CMSReviewComment {
  id: string;
  source_table: string;
  source_id: string;
  revision_id?: string;
  body: string;
  comment_type: CommentType;
  parent_comment_id?: string;
  resolved: boolean;
  resolved_by?: string;
  resolved_at?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  /** Joined author info */
  author?: {
    email?: string;
    display_name?: string;
  };
  /** Nested replies */
  replies?: CMSReviewComment[];
}

// ── Workflow ────────────────────────────────────────────────────────

export interface WorkflowTransition {
  from: WorkflowState;
  to: WorkflowState;
  label: string;
  description?: string;
  requiredRoles: ('admin' | 'moderator' | 'editor')[];
  requiresComment?: boolean;
  /** Side effects on transition */
  onTransition?: (metadata: CMSContentMetadata) => Partial<CMSContentMetadata>;
}

// ── Media ──────────────────────────────────────────────────────────

export interface CMSMedia {
  id: string;
  filename: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  width?: number;
  height?: number;
  storage_path: string;
  alt_text?: Record<string, string>;
  caption?: Record<string, string>;
  attribution?: string;
  license?: string;
  source_url?: string;
  author?: string;
  created_at: string;
  uploaded_by?: string;
  external_source?: string;
  external_id?: string;
}

export interface CMSMediaAttachment {
  id: string;
  media_id: string;
  source_table: string;
  source_id: string;
  media_role: MediaRole;
  sort_order: number;
  metadata?: Record<string, unknown>;
  created_at: string;
  created_by?: string;
  /** Joined media details */
  media?: CMSMedia;
}

// ── Pages (blog posts, guides, static pages) ───────────────────────

export type PageType = 'page' | 'blog_post' | 'guide' | 'resource';

export interface CMSPage {
  id: string;
  slug: string;
  page_type: PageType;
  title: string;
  subtitle?: string;
  excerpt?: string;
  body_json?: Record<string, unknown>;
  body_html?: string;
  cover_image_url?: string;
  cover_image_alt?: string;
  meta_title?: string;
  meta_description?: string;
  canonical_url?: string;
  og_image_url?: string;
  tags?: string[];
  category?: string;
  workflow_state: WorkflowState;
  visibility_level: VisibilityLevel;
  published_at?: string;
  published_by?: string;
  scheduled_publish_at?: string;
  author_id?: string;
  created_by?: string;
  created_at: string;
  updated_by?: string;
  updated_at: string;
  parent_slug?: string;
}

// ── Help / Crisis Hotlines ─────────────────────────────────────────

export type HotlineChannelKind = 'phone' | 'sms' | 'whatsapp' | 'chat' | 'email';

export interface HotlineChannel {
  kind: HotlineChannelKind;
  /** tel: number digits, https URL, or mailto: address */
  value: string;
  label?: string;
  /** Per-channel hours (chat often differs from phone) */
  hours?: string;
}

export type HotlineAffiliation = 'secular' | 'religious' | 'state' | 'ngo';

/**
 * One opening slot, in the hotline's OWN timezone (see `Hotline.timezone`).
 *
 * Deliberately not the `src/utils/openingHours.ts` shape (`day: 1-7`, `"HHMM"`).
 * That one is scraper-written and never read by a human; these live in a CMS
 * jsonb blob that admins hand-edit, so they use the legible `0 = Sunday` /
 * `"HH:MM"` form. `close: "24:00"` means end of day; a `close` at or before
 * `open` means the slot runs past midnight into the next day.
 */
export interface HotlineHoursSlot {
  /** 0 = Sunday … 6 = Saturday. */
  day: number;
  /** "HH:MM", 24h, in `Hotline.timezone`. */
  open: string;
  /** "HH:MM", 24h. "24:00" = end of day; <= `open` = runs past midnight. */
  close: string;
}

export interface Hotline {
  id: string;
  name: string;
  /** ISO country code, or 'INT' for international */
  country: string;
  /** Primary phone — kept for backward compat. Authoritative list is `channels`. */
  phone: string | null;
  channels?: HotlineChannel[];
  topics: string[];
  /** Finer-grained populations: trans-youth, asylum, sex-work, hiv, elders, deaf, … */
  intersections?: string[];
  languages: string[];
  /** Human-readable display string. Stays authoritative for what we SHOW. */
  hours: string;
  /**
   * Machine-readable form of `hours`, for open-now sorting and labelling.
   * Absent = unknown, which must render as silence: a line whose hours we
   * cannot structure is never labelled "Closed". Only ever derived from what
   * the operator itself publishes.
   */
  hours_slots?: HotlineHoursSlot[];
  /** IANA zone the slots are expressed in. Required alongside `hours_slots`. */
  timezone?: string;
  /** True only where the operator publishes round-the-clock availability. */
  always_open?: boolean;
  description: string;
  /** 2–3 sentence reassurance shown in card expand + as the per-hotline override of the generic block */
  what_to_expect?: string;
  free?: boolean;
  anonymous?: boolean;
  /**
   * THREE-state, and the distinction is load-bearing — this is an outing risk.
   *   true   — the operator publishes that it may contact police / emergency
   *            services WITHOUT the caller's consent.
   *   false  — the operator publishes an explicit policy that it does not.
   *   absent — the operator does not address it. Renders nothing.
   * Never inferred from "anonymous" or "confidential" claims. `false` is a
   * positive safety claim and needs its own citation, exactly like `true`.
   */
  reports_to_police?: boolean;
  operator?: string;
  affiliation?: HotlineAffiliation;
  /**
   * Distinguishes a call-now crisis line from a referral/umbrella org that only
   * offers a website (no phone/channel). Directories are rendered separately so
   * a user in crisis is never shown a website where they expect a hotline.
   * Defaults to 'hotline' when absent.
   */
  kind?: 'hotline' | 'directory';
  /** ISO date — required for any newly-edited entry */
  verified_at?: string;
  verified_by?: string;
  /** How verified_at was established (e.g. URL-liveness + phone format). Phones cannot be auto-dialed. */
  verified_method?: string;
  /** Result of the last automated URL-liveness check. */
  link_status?: 'live' | 'broken' | 'bot_blocked';
  /** ISO date of the last URL-liveness check. */
  link_checked_at?: string;
  /** Set when the entry needs a human to re-check a dead/changed link or number. */
  needs_review?: boolean;
  source_url?: string;
  url?: string;
}

// ── Audit Log ──────────────────────────────────────────────────────

export interface CMSAuditEntry {
  id: string;
  content_id?: string;
  source_table?: string;
  source_id?: string;
  action: string;
  actor_id?: string;
  changes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  timestamp: string;
  ip_address?: string;
  user_agent?: string;
  /** Joined actor info */
  actor?: {
    email?: string;
    display_name?: string;
  };
}

// ── Editor State ───────────────────────────────────────────────────

export interface EditorState {
  /** Content type being edited */
  contentType: string;
  /** ID of the item (null for new) */
  itemId: string | null;
  /** Current form data */
  data: Record<string, unknown>;
  /** Original data (for dirty checking) */
  originalData: Record<string, unknown>;
  /** Whether the form has unsaved changes */
  isDirty: boolean;
  /** Whether the form is currently saving */
  isSaving: boolean;
  /** Whether the form is loading */
  isLoading: boolean;
  /** Validation errors */
  errors: Record<string, string>;
  /** Active field group tab */
  activeGroup: FieldGroup;
  /** CMS metadata (if exists) */
  metadata?: CMSContentMetadata;
}

// ── List / Filter State ────────────────────────────────────────────

export interface ContentListFilters {
  search?: string;
  contentType?: string;
  workflowState?: WorkflowState;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

export interface ContentListResult {
  items: ContentItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
