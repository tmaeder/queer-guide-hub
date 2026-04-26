/**
 * CMS Type System
 * Central type definitions for the unified Content Management System.
 */

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
  | 'city_autocomplete'
  | 'country_autocomplete';

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
  /** Searchable in list view */
  searchable?: boolean;
  /** Sortable in list view */
  sortable?: boolean;
  /** Filterable in list view */
  filterable?: boolean;
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

export interface ContentTypeConfig {
  /** Unique ID matching the source table (e.g., 'venues', 'events') */
  id: string;
  /** Database table name */
  tableName: string;
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
  /** Cross-type bulk operations enabled for this type. */
  bulkOps?: BulkOpKind[];
}

export type AIAssistOp =
  | 'summarize'
  | 'translate'
  | 'alt_text'
  | 'seo_draft'
  | 'auto_tag'
  | 'fact_check';

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

export type BulkOpKind =
  | 'publish'
  | 'archive'
  | 'unpublish'
  | 'translate'
  | 'tag'
  | 'delete';

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
