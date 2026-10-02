import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  GovernanceLocationField,
  GovernanceSelectField,
  GovernanceTagsField,
} from './GovernanceFieldControls';
import { fieldControlKind, GOVERNANCE_SELECT_OPTIONS } from './governanceFieldControlUtils';

const PRIORITY_FIELDS = [
  'name',
  'title',
  'description',
  'content',
  'category',
  'address',
  'city',
  'country',
  'website',
  'url',
  'phone',
  'email',
  'tags',
  'opening_hours',
  'accessibility',
];

const TECHNICAL_FIELDS = new Set([
  'id',
  'source_id',
  'sourceid',
  'entity_id',
  'entityid',
  'entity_type',
  'entitytype',
  'source_name',
  'sourcename',
  'created_at',
  'updated_at',
  'metadata',
]);

function humanizeField(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (letter) => letter.toUpperCase());
}

function safeHttpUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

function displayString(value: string) {
  const date = /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value) ? new Date(value) : null;
  if (date && !Number.isNaN(date.getTime())) {
    return date.toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      ...(value.includes('T') ? { hour: '2-digit', minute: '2-digit' } : {}),
    });
  }
  return value;
}

export function StructuredValue({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null || value === undefined || value === '') {
    return (
      <span className="text-muted-foreground" aria-label="Not provided">
        —
      </span>
    );
  }
  if (typeof value === 'boolean') return <span>{value ? 'Yes' : 'No'}</span>;
  if (typeof value === 'number') return <span className="tabular-nums">{value}</span>;
  if (typeof value === 'string') {
    const safeUrl = safeHttpUrl(value);
    if (safeUrl) {
      return (
        <a
          href={safeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-w-0 items-center gap-1 break-all underline decoration-border underline-offset-2 hover:decoration-foreground"
        >
          {value.replace(/^https?:\/\//, '')}
          <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
        </a>
      );
    }
    return <span className="whitespace-pre-wrap break-words">{displayString(value)}</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted-foreground">None</span>;
    return (
      <span className="flex flex-wrap gap-1.5">
        {value.map((entry, index) => (
          <span key={`${String(entry)}-${index}`} className="rounded-badge bg-muted px-2 py-0.5">
            {typeof entry === 'object' ? (
              <StructuredValue value={entry} depth={depth + 1} />
            ) : (
              String(entry)
            )}
          </span>
        ))}
      </span>
    );
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, entry]) => entry !== null && entry !== undefined && entry !== '',
    );
    if (entries.length === 0) return <span className="text-muted-foreground">None</span>;
    return (
      <dl className={`grid min-w-0 gap-x-4 gap-y-2 ${depth === 0 ? 'sm:grid-cols-2' : ''}`}>
        {entries.map(([key, entry]) => (
          <div key={key} className="min-w-0">
            <dt className="text-2xs font-medium text-muted-foreground">{humanizeField(key)}</dt>
            <dd className="mt-0.5 min-w-0 text-13">
              <StructuredValue value={entry} depth={depth + 1} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return <span>{String(value)}</span>;
}

function editableValue(value: unknown): value is string | number | boolean | string[] {
  return (
    ['string', 'number', 'boolean'].includes(typeof value) ||
    (Array.isArray(value) && value.every((entry) => typeof entry === 'string'))
  );
}

function coerceValue(original: unknown, value: string | boolean): unknown {
  if (typeof original === 'boolean') return Boolean(value);
  if (typeof original === 'number') return value === '' ? null : Number(value);
  if (Array.isArray(original)) {
    return String(value)
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return value;
}

interface StructuredFieldEditorProps {
  data: Record<string, unknown>;
  entityType?: string;
  onSave: (changes: Record<string, unknown>) => Promise<void>;
  onDirtyChange?: (dirtyCount: number) => void;
  saving?: boolean;
}

export function StructuredFieldEditor({
  data,
  entityType,
  onSave,
  onDirtyChange,
  saving = false,
}: StructuredFieldEditorProps) {
  const [draftState, setDraftState] = useState<{
    source: Record<string, unknown>;
    values: Record<string, unknown>;
  }>({
    source: data,
    values: {},
  });
  if (draftState.source !== data) setDraftState({ source: data, values: {} });
  const drafts = draftState.source === data ? draftState.values : {};

  const entries = useMemo(
    () =>
      Object.entries(data)
        .filter(
          ([key, value]) =>
            !TECHNICAL_FIELDS.has(key.toLowerCase()) &&
            value !== null &&
            value !== undefined &&
            value !== '',
        )
        .sort(([a], [b]) => {
          const ai = PRIORITY_FIELDS.indexOf(a);
          const bi = PRIORITY_FIELDS.indexOf(b);
          if (ai === -1 && bi === -1) return a.localeCompare(b);
          if (ai === -1) return 1;
          if (bi === -1) return -1;
          return ai - bi;
        }),
    [data],
  );
  const dirtyCount = Object.keys(drafts).length;

  useEffect(() => {
    onDirtyChange?.(dirtyCount);
  }, [dirtyCount, onDirtyChange]);

  function updateField(key: string, original: unknown, value: string | boolean) {
    const next = coerceValue(original, value);
    updateTypedField(key, original, next);
  }

  function updateTypedField(key: string, original: unknown, next: unknown) {
    setDraftState((current) => {
      const values = { ...current.values };
      if (JSON.stringify(next) === JSON.stringify(original)) delete values[key];
      else values[key] = next;
      return { source: data, values };
    });
  }

  async function saveDrafts() {
    await onSave(drafts);
    setDraftState({ source: data, values: {} });
  }

  return (
    <section aria-labelledby="review-fields-heading" className="border-t border-border">
      <div className="flex items-center justify-between gap-4 bg-muted/40 px-4 py-2">
        <div>
          <h3 id="review-fields-heading" className="text-13 font-semibold">
            Review fields
          </h3>
          <p className="text-2xs text-muted-foreground">
            Correct the proposed content before approving.
          </p>
        </div>
        {dirtyCount > 0 && (
          <Button size="sm" onClick={saveDrafts} disabled={saving} className="shrink-0">
            <Save className="mr-1.5 size-3.5" aria-hidden="true" />
            {saving ? 'Saving…' : `Save ${dirtyCount}`}
          </Button>
        )}
      </div>
      <div className="grid gap-x-4 gap-y-4 p-4 xl:grid-cols-2">
        {entries.map(([key, original]) => {
          const value = key in drafts ? drafts[key] : original;
          const controlKind = fieldControlKind(entityType, key);
          const isLong =
            typeof original === 'string' && (original.length > 100 || original.includes('\n'));
          return (
            <div
              key={key}
              className={`min-w-0 space-y-1 ${isLong || controlKind === 'location' || (typeof original === 'object' && !Array.isArray(original)) ? 'xl:col-span-2' : ''}`}
            >
              <span className="flex items-center gap-2 text-2xs font-medium text-muted-foreground">
                {humanizeField(key)}
                {key in drafts && <span className="text-foreground">Edited</span>}
              </span>
              {controlKind === 'venue-category' || controlKind === 'event-type' ? (
                <GovernanceSelectField
                  ariaLabel={humanizeField(key)}
                  value={String(value ?? '')}
                  options={GOVERNANCE_SELECT_OPTIONS[controlKind]}
                  onChange={(next) => updateTypedField(key, original, next)}
                />
              ) : controlKind === 'tags' && Array.isArray(value) ? (
                <GovernanceTagsField
                  value={value.filter((entry): entry is string => typeof entry === 'string')}
                  onChange={(next) => updateTypedField(key, original, next)}
                />
              ) : controlKind === 'location' &&
                value &&
                typeof value === 'object' &&
                !Array.isArray(value) ? (
                <GovernanceLocationField
                  value={value as Record<string, unknown>}
                  onChange={(next) => updateTypedField(key, original, next)}
                />
              ) : !editableValue(original) ? (
                <div className="rounded-element border border-border bg-muted/20 px-4 py-2 text-13">
                  <StructuredValue value={value} />
                </div>
              ) : typeof original === 'boolean' ? (
                <span className="flex h-10 items-center gap-2 rounded-element border border-border px-4 text-13">
                  <input
                    type="checkbox"
                    aria-label={humanizeField(key)}
                    checked={Boolean(value)}
                    onChange={(event) => updateField(key, original, event.target.checked)}
                  />
                  {value ? 'Yes' : 'No'}
                </span>
              ) : isLong ? (
                <Textarea
                  aria-label={humanizeField(key)}
                  value={Array.isArray(value) ? value.join(', ') : String(value ?? '')}
                  onChange={(event) => updateField(key, original, event.target.value)}
                  className="min-h-24 resize-y text-13 leading-relaxed"
                />
              ) : (
                <Input
                  aria-label={humanizeField(key)}
                  type={
                    typeof original === 'number'
                      ? 'number'
                      : /(?:^|_)(?:url|website)$/.test(key)
                        ? 'url'
                        : key === 'email'
                          ? 'email'
                          : key === 'phone'
                            ? 'tel'
                            : 'text'
                  }
                  value={Array.isArray(value) ? value.join(', ') : String(value ?? '')}
                  onChange={(event) => updateField(key, original, event.target.value)}
                  className="h-10 text-13"
                />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
