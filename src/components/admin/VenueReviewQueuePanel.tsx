import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { useDebounce } from '@/hooks/useDebounce';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, X, ExternalLink, ListChecks } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { AdminStat } from '@/components/admin/primitives/AdminStat';
import { AdminTableSkeleton } from '@/components/admin/primitives/AdminLoading';
import {
  useVenueReviewCandidates,
  useVenueReviewCounts,
  useDecideVenueCategory,
  useDecideVenueNonvenue,
  type ReviewKind,
  type VenueReviewCandidate,
} from '@/hooks/useVenueReviewQueue';

/** The engine's own vocabulary. A reviewer overriding a suggestion picks from
 *  the same closed list the classifier writes, so review cannot introduce a
 *  category that no filter or facet knows about. */
const CATEGORIES = [
  'bar',
  'club',
  'cafe',
  'restaurant',
  'sauna',
  'cruising',
  'event-venue',
  'shop',
  'hotel',
  'theater',
  'gallery',
  'outdoor',
  'community_center',
  'other',
] as const;

const REASON_LABEL: Record<string, string> = {
  looks_like_event: 'Looks like an event',
  matches_city_name: 'Name is a city',
  junk_name: 'Junk name',
  matches_queer_village_name: 'Name is a queer village',
  looks_like_organization: 'Looks like an organisation',
};

function Evidence({ c }: { c: VenueReviewCandidate }) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline gap-2">
        <span className="truncate text-title font-bold">{c.name}</span>
        {c.website && (
          <a
            href={c.website}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label={`Open ${c.name} website`}
          >
            <ExternalLink size={13} />
          </a>
        )}
      </div>
      <div className="truncate text-13 text-muted-foreground">
        {[c.city, c.country, c.data_source].filter(Boolean).join(' · ')}
      </div>
      {/* The decisive column. The engine reads these raw provider tags, and so
          should the human: "Movie Theater,Save,mixed" settles a row that the
          name alone ("Cine Hoyts") cannot. */}
      {c.source_tags && (
        <div className="mt-1.5 truncate text-13">
          <span className="text-2xs uppercase tracking-label text-muted-foreground">
            Source tags
          </span>{' '}
          {c.source_tags}
        </div>
      )}
      {c.description && (
        <div className="mt-1.5 line-clamp-2 text-13 text-muted-foreground">{c.description}</div>
      )}
    </div>
  );
}

function CategoryRow({ c }: { c: VenueReviewCandidate }) {
  const decide = useDecideVenueCategory();
  const [override, setOverride] = useState<string>('');
  const busy = decide.isPending;

  return (
    <li className="grid gap-4 border-b border-foreground/10 py-4 last:border-b-0 md:grid-cols-[1fr_auto] md:items-start">
      <Evidence c={c} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-13 font-bold tabular-nums">
          {c.suggested ?? '—'}
          {c.confidence != null && (
            <span className="ms-1 font-normal text-muted-foreground">
              {Math.round(c.confidence * 100)}%
            </span>
          )}
        </span>
        {/* Overriding is the common case — the engine is often close but wrong
            ("Male Massage Noida" suggested as a hotel) and accept-or-nothing
            would throw away what the reviewer actually knows. */}
        <select
          aria-label={`Category for ${c.name}`}
          value={override}
          onChange={(e) => setOverride(e.target.value)}
          className="h-8 bg-card px-2 text-13 rounded-container shadow-soft"
        >
          <option value="">Use suggestion</option>
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          disabled={busy}
          onClick={() => decide.mutate({ venueId: c.id, accept: true, category: override || null })}
        >
          <Check size={14} /> Apply
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => decide.mutate({ venueId: c.id, accept: false })}
        >
          <X size={14} /> Reject
        </Button>
      </div>
    </li>
  );
}

function NonvenueRow({ c }: { c: VenueReviewCandidate }) {
  const decide = useDecideVenueNonvenue();
  const busy = decide.isPending;

  return (
    <li className="grid gap-4 border-b border-foreground/10 py-4 last:border-b-0 md:grid-cols-[1fr_auto] md:items-start">
      <Evidence c={c} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-13 text-muted-foreground">
          {REASON_LABEL[c.reason ?? ''] ?? c.reason}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => decide.mutate({ venueId: c.id, confirm: true })}
        >
          <Check size={14} /> Not a venue
        </Button>
        <Button
          size="sm"
          disabled={busy}
          onClick={() => decide.mutate({ venueId: c.id, confirm: false })}
        >
          <X size={14} /> It is a venue
        </Button>
      </div>
    </li>
  );
}

/**
 * The review surface for the venue category engine's held-back output.
 *
 * The engine (`run_venue_category_reclassify`) auto-applies only the three
 * categories that clear 85% measured agreement and records everything else as a
 * suggestion. That is the right call — at its own top confidence the `hotel`
 * set still contains "Male Massage Noida" — but until now the suggestions had
 * nowhere to go, and `CategoryCoveragePanel` rendered "awaiting review" as a
 * number with no verb behind it.
 *
 * Non-venues are never archived automatically. The detection heuristic measures
 * around 50% precision on its own: it flags "Lighthouse Bar & Grill" next to
 * "Carrer de Tomàs Ortuño". Confirming is a reversible soft-archive, and the
 * previous state is snapshotted so it can be put back.
 */
export function VenueReviewQueuePanel() {
  const [kind, setKind] = useState<ReviewKind>('category');
  const [city, setCity] = useState('');
  // Debounced: the queue is ~1,300 rows behind a SECURITY DEFINER function, and a
  // per-keystroke refetch would run it once per character typed.
  const debouncedCity = useDebounce(city, 300);
  const { data: counts } = useVenueReviewCounts();
  const { data: rows = [], isLoading } = useVenueReviewCandidates(kind, 25, debouncedCity);

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-title">
          <ListChecks size={16} />
          Venue review queue
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <AdminStat label="Category suggestions" value={counts?.category_pending ?? 0} />
          <AdminStat label="Probable non-venues" value={counts?.nonvenue_pending ?? 0} />
          <AdminStat label="No signal (stays 'other')" value={counts?.no_signal ?? 0} />
          <AdminStat label="Not yet examined" value={counts?.unexamined ?? 0} />
        </div>

        <div className="flex gap-2">
          {(['category', 'nonvenue'] as const).map((k) => (
            <Button
              key={k}
              size="sm"
              variant={kind === k ? 'default' : 'outline'}
              onClick={() => setKind(k)}
            >
              {k === 'category' ? 'Categories' : 'Non-venues'}
            </Button>
          ))}
          <Input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Filter by city"
            aria-label="Filter review queue by city"
            className="h-8 w-40 text-13"
          />
          <LocalizedLink
            to="/admin/content/venues"
            className="ms-auto self-center text-13 font-bold no-underline"
          >
            All venues →
          </LocalizedLink>
        </div>

        {isLoading ? (
          <AdminTableSkeleton rows={5} columns={3} />
        ) : rows.length === 0 ? (
          <p className="py-6 text-13 text-muted-foreground">
            {debouncedCity.trim()
              ? `Nothing waiting for “${debouncedCity.trim()}”.`
              : 'Nothing waiting. The engine leaves rows it cannot judge as ‘other’ rather than guessing.'}
          </p>
        ) : (
          <ul className="m-0 list-none p-0">
            {rows.map((c) =>
              kind === 'category' ? (
                <CategoryRow key={c.id} c={c} />
              ) : (
                <NonvenueRow key={c.id} c={c} />
              ),
            )}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default VenueReviewQueuePanel;
