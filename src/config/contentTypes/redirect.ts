import { createElement } from 'react';
import { Copy, ExternalLink, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { validateSlug, detectLoop } from '@/lib/redirects/validation';
import { RedirectEventsPanel } from '@/components/admin/redirects/RedirectEventsPanel';
import { RedirectToolbarActions } from '@/components/admin/redirects/RedirectToolbarActions';
import type { ContentTypeConfig, FieldConfig } from '@/types/cms';
import type { ValidationError } from '@/utils/contentValidation';

/**
 * Redirects on the CMS registry.
 *
 * Replaces the standalone `AdminRedirects` page. Everything it did has a home
 * here: row actions for copy/test, a per-record analytics panel, conditional
 * fields for the two redirect shapes, and the slug + loop validation it ran
 * before saving.
 *
 * The two shapes are the reason `FieldConfig.visibleWhen` exists:
 *   SHORT — a /go/<slug> short link
 *   PATH  — an old path that should forward somewhere
 * Showing both `slug` and `source_path` on every record would be a worse editor
 * than the bespoke dialog this replaces.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

const isShort = (v: Record<string, unknown>) => v.type === 'SHORT';
const isPath = (v: Record<string, unknown>) => v.type === 'PATH';

/** `/go/<slug>` for a SHORT link, the source path for a PATH redirect. */
function requestPathOf(row: Record<string, unknown>): string {
  return row.type === 'SHORT' ? `/go/${String(row.slug ?? '')}` : String(row.source_path ?? '');
}

export const redirectFields: FieldConfig[] = [
  {
    name: 'type',
    label: 'Type',
    type: 'select',
    required: true,
    group: 'basic',
    filterable: true,
    sortable: true,
    listColumn: true,
    options: [
      { value: 'SHORT', label: 'Short Link' },
      { value: 'PATH', label: 'Path Redirect' },
    ],
    helpText: 'SHORT serves /go/<slug>. PATH forwards an existing URL.',
  },
  {
    name: 'slug',
    label: 'Slug',
    type: 'text',
    required: true,
    group: 'basic',
    searchable: true,
    listColumn: true,
    visibleWhen: isShort,
    helpText: 'Served at /go/<slug>. Lowercase, at least 3 characters.',
  },
  {
    name: 'source_path',
    label: 'Source Path',
    type: 'text',
    required: true,
    group: 'basic',
    searchable: true,
    listColumn: true,
    visibleWhen: isPath,
    placeholder: '/old-path',
  },
  {
    name: 'target',
    label: 'Target',
    type: 'text',
    required: true,
    group: 'basic',
    searchable: true,
    listColumn: true,
    helpText: 'Where the redirect lands. A path, or an absolute URL.',
  },
  {
    // A number field, NOT a select. `status_code` is an integer column, but
    // SelectField emits strings and nothing in the save path coerces — so a
    // select built a z.enum of strings that rejected the NUMBER Postgres
    // returns, and every existing redirect failed validation on open.
    name: 'status_code',
    label: 'Status Code',
    type: 'number',
    group: 'settings',
    sortable: true,
    min: 300,
    max: 399,
    helpText: '301 or 308 permanent, 302 or 307 temporary.',
  },
  {
    name: 'is_enabled',
    label: 'Enabled',
    type: 'boolean',
    group: 'settings',
    filterable: true,
    listColumn: true,
  },
  {
    name: 'match_kind',
    label: 'Match Kind',
    type: 'select',
    group: 'settings',
    visibleWhen: isPath,
    options: [
      { value: 'EXACT', label: 'Exact' },
      { value: 'WILDCARD', label: 'Wildcard' },
      { value: 'REGEX', label: 'Regex' },
    ],
  },
  {
    name: 'query_mode',
    label: 'Query Handling',
    type: 'select',
    group: 'settings',
    options: [
      { value: 'PRESERVE', label: 'Preserve' },
      { value: 'DROP', label: 'Drop' },
      { value: 'OVERRIDE', label: 'Override' },
    ],
  },
  {
    name: 'query_override',
    label: 'Query Override',
    type: 'json',
    group: 'settings',
    visibleWhen: (v) => v.query_mode === 'OVERRIDE',
  },
  { name: 'utm_defaults', label: 'UTM Defaults', type: 'json', group: 'settings' },
  { name: 'start_at', label: 'Starts', type: 'datetime', group: 'settings' },
  { name: 'end_at', label: 'Ends', type: 'datetime', group: 'settings' },
  {
    name: 'click_limit',
    label: 'Click Limit',
    type: 'number',
    group: 'settings',
    helpText: 'Stops resolving once reached. Leave empty for unlimited.',
  },
  {
    name: 'click_count',
    label: 'Clicks',
    type: 'number',
    group: 'settings',
    readOnly: true,
    sortable: true,
    listColumn: true,
  },
  { name: 'notes', label: 'Notes', type: 'textarea', group: 'details', searchable: true },
];

export const redirectContentType: ContentTypeConfig = {
  id: 'redirects',
  tableName: 'redirects',
  primaryKey: 'id',
  titleField: 'target',
  descriptionField: 'notes',
  icon: Link2,
  label: { singular: 'Redirect', plural: 'Redirects' },
  color: 'hsl(var(--muted-foreground))',
  fields: redirectFields,
  listSelect: 'id,type,slug,source_path,target,status_code,is_enabled,click_count,notes,updated_at',
  defaults: {
    type: 'SHORT',
    status_code: 301,
    is_enabled: true,
    match_kind: 'EXACT',
    query_mode: 'PRESERVE',
    click_count: 0,
  },
  fieldGroupOrder: ['basic', 'settings', 'details'],
  defaultSort: { field: 'updated_at', dir: 'desc' },

  /**
   * Ported from the page this replaces. Both checks are synchronous and read
   * only the row being saved — `detectLoop` compares the request path to the
   * target and never queries other redirects — so they fit here as-is.
   */
  validate: (data) => {
    const errors: ValidationError[] = [];

    if (data.type === 'SHORT') {
      const slug = validateSlug(String(data.slug ?? ''));
      if (!slug.valid) {
        errors.push({ field: 'slug', message: slug.error ?? 'Invalid slug', severity: 'error' });
      }
    }

    const target = String(data.target ?? '');
    if (target) {
      const loop = detectLoop(requestPathOf(data), target);
      if (!loop.safe) {
        errors.push({
          field: 'target',
          message: loop.error ?? 'This redirect points at itself',
          severity: 'error',
        });
      }
    }

    return { isValid: errors.length === 0, errors, warnings: [] };
  },

  rowActions: [
    {
      id: 'copy',
      label: 'Copy short URL',
      icon: Copy,
      visible: (row) => row.type === 'SHORT' && !!row.slug,
      onSelect: (row) => {
        void navigator.clipboard
          .writeText(`${window.location.origin}/go/${String(row.slug)}`)
          .then(() => toast.success('Short URL copied'))
          .catch(() => toast.error('Could not copy'));
      },
    },
    {
      id: 'test',
      label: 'Test redirect',
      icon: ExternalLink,
      visible: (row) => row.type === 'SHORT' && !!row.slug,
      onSelect: (row) => {
        window.open(
          `${SUPABASE_URL}/functions/v1/redirect-handler?slug=${String(row.slug)}`,
          '_blank',
          'noopener',
        );
      },
    },
  ],

  // Bulk import + rule preview are collection-level, so they belong here
  // rather than in extraPanels (which render per-record).
  toolbarActions: () => createElement(RedirectToolbarActions),

  // Click analytics are per-redirect, so they belong in the editor rather than
  // the separate dialog the old page opened from a row action.
  extraPanels: [
    {
      id: 'events',
      label: 'Click analytics',
      render: (contentId: string) => createElement(RedirectEventsPanel, { redirectId: contentId }),
    },
  ],
};
