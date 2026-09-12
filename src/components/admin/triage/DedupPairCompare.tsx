import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AdminCompareFrame, type CompareRow } from '@/components/admin/frames/AdminCompareFrame';

/**
 * A queued duplicate pair, side by side, with the fields that decide it.
 *
 * The dedup queue is fed automatically and drained by nobody: 1,455 pairs open,
 * the venue arm pinned at its 200/night cap on 5 of the last 6 nights, and zero
 * human decisions since 2026-08-17. The pair was not decidable as presented —
 * `FallbackPreview` dumped the cluster jsonb through `JSON.stringify`, and
 * `TriageDetailPanel`'s Context section dumped the same object again below it.
 * Two JSON blobs, twice.
 *
 * This is Archetype C, which already existed (`AdminCompareFrame`), was tested,
 * and was used by nothing — including `/admin/duplicates`, the one route its own
 * docblock names.
 *
 * Conflicts are marked by a written label, never fill alone (WCAG 1.4.1) — that
 * rule lives in the frame. What lives here is which fields to show and in what
 * order: the discriminating ones first, because a reviewer scanning 1,159 venue
 * pairs reads the top of the list and stops.
 */

/** Fields that actually decide a pair, most decisive first, per entity type. */
const FIELD_ORDER: Record<string, readonly string[]> = {
  venue: ['address', 'website', 'phone', 'city', 'category', 'quality_score', 'has_coords', 'slug'],
  event: ['start_date', 'venue_name', 'city', 'end_date', 'slug'],
  city: [
    'country',
    'region',
    'population',
    'venues',
    'events',
    'wikidata_qid',
    'shell_status',
    'slug',
  ],
  personality: [
    'wikidata_qid',
    'birth_date',
    'death_date',
    'profession',
    'nationality',
    'visibility',
    'slug',
  ],
  milestone: ['year', 'event_date', 'category', 'slug'],
  organization: ['website_domain', 'city', 'roles', 'slug'],
  hotel: ['address', 'website', 'city', 'slug'],
  marketplace: ['merchant_domain', 'brand', 'price', 'currency', 'external_url', 'slug'],
  queer_village: ['city', 'slug'],
  country: ['code', 'slug'],
  group: ['city', 'slug'],
};

const HIDDEN = new Set(['id', 'title']);

type Side = Record<string, unknown> | null | undefined;

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** Same-ness is compared on the FORMATTED value, so `null` and `''` agree. */
const agree = (a: unknown, b: unknown) => fmt(a) === fmt(b);

export interface DedupPairCompareProps {
  entityType: string;
  meta: Record<string, unknown> | null | undefined;
  /** Which id currently survives. */
  keepId?: string | null;
  /** Offer the canonical flip. Omitted when the caller cannot act on it. */
  onFlip?: (newKeepId: string) => void;
  flipped?: boolean;
}

export function DedupPairCompare({
  entityType,
  meta,
  keepId,
  onFlip,
  flipped,
}: DedupPairCompareProps) {
  const keep = (meta?.keep ?? null) as Side;
  const drop = (meta?.drop ?? null) as Side;

  const rows = useMemo<CompareRow[]>(() => {
    const order = FIELD_ORDER[entityType] ?? [];
    const present = new Set<string>([...Object.keys(keep ?? {}), ...Object.keys(drop ?? {})]);
    for (const h of HIDDEN) present.delete(h);
    // Preferred order first, then anything else the payload carried, so a field
    // added to `dedup_pair_side` shows up without a code change here.
    const fields = [
      ...order.filter((f) => present.has(f)),
      ...[...present].filter((f) => !order.includes(f)).sort(),
    ];

    return fields.map((field) => {
      const a = keep?.[field];
      const b = drop?.[field];
      const both =
        a !== undefined && a !== null && a !== '' && b !== undefined && b !== null && b !== '';
      return {
        field: field.replace(/_/g, ' '),
        left: fmt(a),
        right: fmt(b),
        // Only a real disagreement is a conflict. One side being blank is a GAP,
        // not evidence the records are different places — 6,049 of 26,688 live
        // venues carry a blank address, and calling that a conflict on every row
        // would make the marker meaningless.
        conflict: both && !agree(a, b),
      };
    });
  }, [entityType, keep, drop]);

  if (!keep && !drop) {
    return (
      <p className="text-15 text-muted-foreground">
        Neither record could be loaded — they may have been merged or deleted since this pair was
        queued.
      </p>
    );
  }

  const sideHeader = (side: Side, role: 'Keeping' | 'Merging away', id?: string) => (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs2 font-bold uppercase tracking-label text-muted-foreground">
        {role}
      </span>
      <span className="truncate font-bold">{fmt(side?.title)}</span>
      {!side && <span className="text-13 text-destructive">Record no longer exists</span>}
      {onFlip && id && id !== keepId && (
        <Button size="sm" variant="outline" className="mt-1 self-start" onClick={() => onFlip(id)}>
          Keep this one instead
        </Button>
      )}
    </div>
  );

  const keepIdStr = typeof keep?.id === 'string' ? keep.id : undefined;
  const dropIdStr = typeof drop?.id === 'string' ? drop.id : undefined;
  const conflicts = rows.filter((r) => r.conflict).length;

  return (
    <AdminCompareFrame
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span>{fmt(keep?.title)}</span>
          <span aria-hidden>⇄</span>
          <span>{fmt(drop?.title)}</span>
          {conflicts > 0 && (
            <Badge variant="outline">
              {conflicts} conflicting field{conflicts === 1 ? '' : 's'}
            </Badge>
          )}
          {flipped && <Badge variant="default">canonical flipped</Badge>}
        </span>
      }
      routeLine={typeof meta?.reason === 'string' ? meta.reason : null}
      leftHeader={sideHeader(keep, 'Keeping', keepIdStr)}
      rightHeader={sideHeader(drop, 'Merging away', dropIdStr)}
      rows={rows}
    />
  );
}
