/**
 * FlyerScanResults — batch review of AI scan results.
 * Every detected item (event/venue/hotel/news/marketplace) is listed with a
 * checkbox, type selector, inline-editable key fields, tag chips, and a
 * duplicate-resolution card (link & enrich an existing entity, or keep as new).
 * The whole selection is submitted in one action.
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle, Check, ChevronDown, ChevronUp, FileText, Link2, X } from 'lucide-react';
import { WatchSiteControl } from '@/components/submission/WatchSiteControl';
import {
  buildSubmissionRow,
  TABLE_BY_DETECTED,
  type BuiltSubmission,
  type DetectedType,
  type DuplicateMatch,
  type FlyerScanItem,
  type FlyerScanResult,
  type VenueCandidate,
} from '@/hooks/useFlyerScan';

interface FlyerScanResultsProps {
  results: FlyerScanResult[];
  onSubmitBatch: (rows: BuiltSubmission[]) => Promise<void> | void;
  onDismiss: () => void;
}

const TYPES: DetectedType[] = ['event', 'venue', 'hotel', 'news', 'marketplace'];
const TYPE_LABEL: Record<DetectedType, string> = {
  event: 'Event',
  venue: 'Venue',
  hotel: 'Hotel',
  news: 'News',
  marketplace: 'Product',
};

// Inline-editable key fields per type (keys match the submission data shape).
const EDITABLE: Record<DetectedType, Array<{ key: string; label: string }>> = {
  event: [
    { key: 'title', label: 'Title' },
    { key: 'start_date', label: 'Start' },
    { key: 'venue_name', label: 'Venue' },
    { key: 'city', label: 'City' },
  ],
  venue: [
    { key: 'name', label: 'Name' },
    { key: 'category', label: 'Category' },
    { key: 'city', label: 'City' },
  ],
  hotel: [
    { key: 'name', label: 'Name' },
    { key: 'city', label: 'City' },
  ],
  news: [
    { key: 'title', label: 'Title' },
    { key: 'author', label: 'Author' },
  ],
  marketplace: [
    { key: 'title', label: 'Title' },
    { key: 'price', label: 'Price' },
  ],
};

// Confidence dot (functional categorical color — "submission scan flyers" is an
// allowlisted exception in the design system).
function confidenceColor(c: number): string {
  if (c >= 0.8) return '#22c55e';
  if (c >= 0.5) return '#eab308';
  return '#ef4444';
}

interface ItemDraft {
  included: boolean;
  type: DetectedType;
  tags: string[];
  selectedVenueId?: string;
  enrich: { id: string; table: string } | null;
  edits: Record<string, string>;
}

function fieldString(item: FlyerScanItem, key: string): string {
  const v = item.fields[key]?.value;
  return v === undefined || v === null ? '' : String(v);
}

function primaryTitle(item: FlyerScanItem, type: DetectedType): string {
  const key = type === 'venue' || type === 'hotel' ? 'name' : 'title';
  return fieldString(item, key) || 'Untitled';
}

function itemDuplicates(item: FlyerScanItem): DuplicateMatch[] {
  if (item.matches.duplicates?.length) return item.matches.duplicates;
  return [
    ...item.matches.duplicate_events.map((d) => ({ id: d.id, title: d.title, score: d.score, type: 'event' as DetectedType })),
    ...item.matches.duplicate_venues.map((d) => ({ id: d.id, title: d.name, score: d.score, type: 'venue' as DetectedType })),
  ].sort((a, b) => b.score - a.score);
}

function makeDraft(item: FlyerScanItem): ItemDraft {
  const dups = itemDuplicates(item);
  const named = primaryTitle(item, item.detected_type) !== 'Untitled';
  const exactDup = dups.some((d) => d.score >= 0.9);
  return {
    included: named && !exactDup,
    type: item.detected_type,
    tags: (item.tag_suggestions ?? []).filter((tg) => tg.preselected).map((tg) => tg.slug),
    enrich: null,
    edits: {},
  };
}

// ── Per-item review row ───────────────────────────────────────────────

function ItemRow({
  item,
  result,
  draft,
  expanded,
  showFile,
  onToggleExpand,
  update,
}: {
  item: FlyerScanItem;
  result: FlyerScanResult;
  draft: ItemDraft;
  expanded: boolean;
  showFile: boolean;
  onToggleExpand: () => void;
  update: (patch: Partial<ItemDraft>) => void;
}) {
  const dups = useMemo(() => itemDuplicates(item), [item]);
  const editable = EDITABLE[draft.type];
  const editableKeys = new Set(editable.map((e) => e.key));
  const suggestions = item.tag_suggestions ?? [];
  const venues = item.matches.venue_candidates;
  const canLinkVenue = draft.type === 'event' || draft.type === 'venue' || draft.type === 'hotel';

  const readOnlyFields = Object.entries(item.fields)
    .filter(
      ([k, f]) =>
        f && typeof f === 'object' && 'confidence' in f && f.confidence > 0.2 && !editableKeys.has(k) && k !== 'description',
    )
    .slice(0, 6);

  return (
    <div className={`rounded-element overflow-hidden border ${expanded ? 'border-foreground' : 'border-border'}`}>
      {/* Header */}
      <div className="flex items-center gap-2 p-4">
        <Checkbox
          checked={draft.included}
          onCheckedChange={(v) => update({ included: !!v })}
          aria-label="Include this item"
        />
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex flex-1 items-center gap-2 min-w-0 text-left"
          aria-expanded={expanded}
        >
          <Badge variant="outline" className="font-semibold shrink-0">
            {TYPE_LABEL[draft.type]}
          </Badge>
          <span className="flex-1 min-w-0 truncate text-sm font-semibold">{primaryTitle(item, draft.type)}</span>
          {showFile && (
            <span className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
              <FileText size={10} />
              {result.source_file}
            </span>
          )}
          {expanded ? (
            <ChevronUp size={16} className="shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown size={16} className="shrink-0 text-muted-foreground" />
          )}
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-4 flex flex-col gap-4">
          {/* Type selector */}
          <div className="flex flex-wrap gap-1.5">
            {TYPES.map((tp) => (
              <Badge
                key={tp}
                onClick={() => update({ type: tp, edits: {}, selectedVenueId: undefined })}
                variant={draft.type === tp ? 'default' : 'secondary'}
                className="cursor-pointer"
              >
                {TYPE_LABEL[tp]}
              </Badge>
            ))}
          </div>

          {/* Duplicate resolution */}
          {dups.length > 0 && (
            <div className="rounded-element border border-border p-4 flex flex-col gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold">
                <AlertTriangle size={14} className="shrink-0" />
                Possible match{dups.length > 1 ? 'es' : ''} already in the guide
              </div>
              <div className="flex flex-col gap-1.5">
                {dups.slice(0, 3).map((d) => {
                  const linked = draft.enrich?.id === d.id;
                  return (
                    <div key={d.id} className="flex items-center gap-2">
                      <span className="flex-1 min-w-0 truncate text-xs">
                        {d.title} <span className="text-muted-foreground">({Math.round(d.score * 100)}%)</span>
                      </span>
                      <Button
                        size="sm"
                        variant={linked ? 'default' : 'outline'}
                        onClick={() => update({ enrich: linked ? null : { id: d.id, table: TABLE_BY_DETECTED[d.type] } })}
                        className="h-7 gap-1 text-xs"
                      >
                        <Link2 size={12} />
                        {linked ? 'Linked' : 'Link & enrich'}
                      </Button>
                    </div>
                  );
                })}
              </div>
              {draft.enrich && (
                <p className="text-xs text-muted-foreground">
                  Submitted as an update to the linked entry — an editor reviews the merge.{' '}
                  <button type="button" className="underline" onClick={() => update({ enrich: null })}>
                    It’s new instead
                  </button>
                </p>
              )}
            </div>
          )}

          {/* Editable key fields */}
          <div className="flex flex-col gap-2">
            {editable.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground shrink-0" style={{ minWidth: 64 }}>
                  {label}
                </span>
                <Input
                  value={draft.edits[key] ?? fieldString(item, key)}
                  onChange={(e) => update({ edits: { ...draft.edits, [key]: e.target.value } })}
                  className="h-8 text-sm"
                />
              </label>
            ))}
          </div>

          {/* Read-only extracted fields with confidence */}
          {readOnlyFields.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {readOnlyFields.map(([key, f]) => (
                <div key={key} className="flex items-baseline gap-2">
                  <span
                    className="rounded-full shrink-0"
                    style={{ width: 8, height: 8, marginTop: 4, backgroundColor: confidenceColor(f.confidence) }}
                    title={`${Math.round(f.confidence * 100)}% confidence`}
                  />
                  <span className="text-xs text-muted-foreground shrink-0" style={{ minWidth: 64 }}>
                    {key}
                  </span>
                  <span className="text-xs break-words">
                    {typeof f.value === 'boolean' ? (f.value ? 'Yes' : 'No') : String(f.value)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Matching venues */}
          {canLinkVenue && venues.length > 0 && (
            <div>
              <span className="text-xs text-muted-foreground font-semibold mb-1.5 block">Use an existing venue</span>
              <div className="flex flex-wrap gap-1.5">
                {venues.map((v: VenueCandidate) => (
                  <Badge
                    key={v.id}
                    onClick={() => update({ selectedVenueId: draft.selectedVenueId === v.id ? undefined : v.id })}
                    variant={draft.selectedVenueId === v.id ? 'default' : 'outline'}
                    className="cursor-pointer"
                  >
                    {draft.selectedVenueId === v.id && <Check size={12} className="mr-1" />}
                    {v.name} ({Math.round(v.score * 100)}%)
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Tag chips */}
          {suggestions.length > 0 && (
            <div>
              <span className="text-xs text-muted-foreground font-semibold mb-1.5 block">Tags</span>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((tag) => {
                  const on = draft.tags.includes(tag.slug);
                  return (
                    <Badge
                      key={tag.slug}
                      onClick={() =>
                        update({ tags: on ? draft.tags.filter((s) => s !== tag.slug) : [...draft.tags, tag.slug] })
                      }
                      variant={on ? 'default' : 'outline'}
                      className="cursor-pointer"
                    >
                      {on && <Check size={12} className="mr-1" />}
                      {tag.label}
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────

export function FlyerScanResults({ results, onSubmitBatch, onDismiss }: FlyerScanResultsProps) {
  const { t } = useTranslation();

  const allItems = useMemo(() => {
    const out: Array<{ key: string; item: FlyerScanItem; result: FlyerScanResult }> = [];
    results.forEach((result, ri) => {
      result.items.forEach((item, ii) => out.push({ key: `${ri}-${ii}`, item, result }));
    });
    return out;
  }, [results]);

  const [drafts, setDrafts] = useState<Record<string, ItemDraft>>(() =>
    Object.fromEntries(allItems.map((a) => [a.key, makeDraft(a.item)])),
  );
  const [expandedKey, setExpandedKey] = useState<string | null>(allItems[0]?.key ?? null);
  const [submitting, setSubmitting] = useState(false);

  const multipleFiles = results.length > 1;
  const includedCount = Object.values(drafts).filter((d) => d.included).length;
  // A pasted-link scan stores the URL in source_file — offer to watch it.
  const watchUrl = results.find((r) => /^https?:\/\//i.test(r.source_file))?.source_file;

  const updateDraft = (key: string, patch: Partial<ItemDraft>) =>
    setDrafts((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  if (allItems.length === 0) {
    return (
      <Card>
        <CardContent data-testid="extraction-empty-card">
          <p className="text-sm text-muted-foreground">{t('submission.errors.extractionEmpty')}</p>
          <Button variant="outline" size="sm" onClick={onDismiss} className="mt-4">
            {t('submission.errors.manualFallbackCta')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const handleSubmit = async () => {
    const rows: BuiltSubmission[] = allItems
      .filter((a) => drafts[a.key]?.included)
      .map((a) => {
        const d = drafts[a.key];
        return buildSubmissionRow(a.item, {
          imageUrl: a.result.image_url,
          typeOverride: d.type,
          selectedVenueId: d.selectedVenueId,
          selectedTagSlugs: d.tags,
          enrich: d.enrich,
          edits: d.edits,
        });
      });
    if (rows.length === 0) return;
    setSubmitting(true);
    try {
      await onSubmitBatch(rows);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardContent>
        <div className="flex justify-between items-center mb-4">
          <p className="text-sm font-semibold">
            Found {allItems.length} item{allItems.length === 1 ? '' : 's'}
            {multipleFiles ? ` across ${results.length} files` : ''}
          </p>
          <Button variant="ghost" size="sm" onClick={onDismiss} className="flex items-center gap-1">
            <X size={14} />
            Dismiss
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          {allItems.map(({ key, item, result }) => (
            <ItemRow
              key={key}
              item={item}
              result={result}
              draft={drafts[key]}
              expanded={expandedKey === key}
              showFile={multipleFiles}
              onToggleExpand={() => setExpandedKey(expandedKey === key ? null : key)}
              update={(patch) => updateDraft(key, patch)}
            />
          ))}
        </div>

        {watchUrl && (
          <div className="mt-4">
            <WatchSiteControl url={watchUrl} />
          </div>
        )}

        <div className="sticky bottom-0 mt-4 pt-4 bg-background border-t border-border">
          <Button onClick={handleSubmit} disabled={includedCount === 0 || submitting} className="w-full">
            {submitting ? 'Submitting…' : `Submit ${includedCount} item${includedCount === 1 ? '' : 's'}`}
          </Button>
          <p className="text-xs text-muted-foreground text-center mt-2">
            All submissions are reviewed before publishing.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
