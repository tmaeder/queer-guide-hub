import { useEffect, useState } from 'react';
import { ExternalLink, MapPin, RefreshCw } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDebounce } from '@/hooks/useDebounce';
import { useVenueMatchReview } from '@/hooks/useVenueMatchReview';
import { reviewHttpUrl } from './reviewEvidence';
import type { ReviewItem } from '@/hooks/useAdminReview';

export interface VenueMatchSelection {
  venue_id: string;
  expected_updated_at: string;
}
export function VenueMatchPanel({
  item,
  busy,
  selection,
  onSelect,
}: {
  item: ReviewItem;
  busy: boolean;
  selection: VenueMatchSelection | null;
  onSelect: (selection: VenueMatchSelection | null) => void;
}) {
  const [search, setSearch] = useState('');
  const query = useVenueMatchReview(item.entity_id, useDebounce(search, 300));
  const context = query.data;
  const selectionCurrent =
    !!selection &&
    !query.isFetching &&
    !query.isError &&
    !context?.event.venue_id &&
    selection.expected_updated_at === context?.event.updated_at &&
    !!context?.candidates.some((candidate) => candidate.id === selection.venue_id);
  useEffect(() => {
    if (selection && !selectionCurrent) onSelect(null);
  }, [onSelect, selection, selectionCurrent]);
  const source = reviewHttpUrl(context?.event.source_url);
  const location = [context?.city, context?.country].filter(Boolean).join(', ');
  // Selection belongs to this exact live query. A search/reload immediately
  // clears it so a previous response cannot submit a stale hidden candidate.
  const clear = () => {
    onSelect(null);
  };
  return (
    <section aria-label="Venue comparison" className="mt-6 space-y-4 border-y border-border py-6">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-base font-semibold">Match the source venue</h3>
        <Button
          variant="ghost"
          size="sm"
          disabled={query.isFetching || busy}
          onClick={() => {
            clear();
            void query.refetch();
          }}
          aria-label="Reload venue candidates"
        >
          <RefreshCw size={14} className="mr-2" />
          Reload
        </Button>
      </div>
      {context && (
        <div className="space-y-2 bg-muted/40 p-4 text-sm">
          <p className="font-medium">{context.event.venue_name || 'No source venue name'}</p>
          <p>{context.event.address || 'Source address not recorded'}</p>
          <p className="flex items-center gap-2 text-muted-foreground">
            <MapPin size={14} />
            {location || 'Location missing'}
          </p>
          {source && (
            <a
              href={source}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 underline underline-offset-4"
            >
              Check event source
              <ExternalLink size={14} />
            </a>
          )}
          <p className="text-xs text-muted-foreground">
            Compare the source name, address and website. Names alone can describe different places.
          </p>
        </div>
      )}
      <label htmlFor="venue-match-search" className="block text-sm font-medium">
        Search venues in this city
      </label>
      <Input
        id="venue-match-search"
        value={search}
        disabled={busy}
        placeholder="Venue name"
        onChange={(e) => {
          clear();
          setSearch(e.target.value);
        }}
      />
      {query.isFetching && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading current catalogue matches…
        </p>
      )}
      {query.isError ? (
        <div role="alert" className="text-sm text-destructive">
          Venue comparison could not be loaded. Reload before linking.
        </div>
      ) : context?.event.venue_id ? (
        <p className="text-sm">
          This event is already linked. Refresh the queue to see remaining work.
        </p>
      ) : context && !context.event.city_id ? (
        <p className="text-sm">
          Set the event’s city in the record editor first. A same-name venue elsewhere is not a
          valid match.
        </p>
      ) : context?.candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No open catalogue venue matches in this city. Try another spelling or use the record
          editor to investigate. The source venue name is preserved.
        </p>
      ) : (
        context && (
          <fieldset disabled={busy || query.isFetching} className="divide-y divide-border">
            <legend className="pb-2 text-sm font-medium">
              {context.candidates.length} possible{' '}
              {context.candidates.length === 1 ? 'venue' : 'venues'} · select after comparison
            </legend>
            {context.candidates.map((candidate) => {
              const website = reviewHttpUrl(candidate.website);
              return (
                <div key={candidate.id} className="py-4">
                  <label
                    aria-label={`Select ${candidate.name}`}
                    htmlFor={`venue-candidate-${candidate.id}`}
                    className="flex min-h-11 cursor-pointer items-start gap-4"
                  >
                    <input
                      type="radio"
                      id={`venue-candidate-${candidate.id}`}
                      name="venue-match"
                      className="mt-1 size-4 accent-current"
                      checked={selectionCurrent && selection?.venue_id === candidate.id}
                      onChange={() => {
                        onSelect({
                          venue_id: candidate.id,
                          expected_updated_at: context.event.updated_at,
                        });
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{candidate.name}</span>
                      <span className="mt-1 block break-words text-sm text-muted-foreground">
                        {candidate.address || 'Address not supplied'}
                      </span>
                      <span className="mt-2 block text-xs">
                        {candidate.name_exact ? 'Exact name' : 'Similar name'} ·{' '}
                        {candidate.distance_m == null
                          ? 'Coordinates unavailable'
                          : `${Math.round(candidate.distance_m).toLocaleString()} m from event coordinates`}
                      </span>
                    </span>
                  </label>
                  {website && (
                    <a
                      className="ml-8 mt-2 inline-flex min-h-9 max-w-full items-center gap-2 break-all text-sm underline underline-offset-4"
                      href={website}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {new URL(website).hostname}
                      <ExternalLink size={14} className="shrink-0" />
                    </a>
                  )}
                </div>
              );
            })}
          </fieldset>
        )
      )}
    </section>
  );
}
