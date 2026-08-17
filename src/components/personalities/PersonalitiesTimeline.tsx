import { useMemo } from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import type { Personality } from '@/hooks/usePersonalities';
import { formatProfession } from '@/lib/professionDisplay';

interface PersonalitiesTimelineProps {
  personalities: Personality[];
}

interface Bucket {
  label: string;
  /** Sort key — lower = earlier; "Living" / "Unknown" go last. */
  order: number;
  items: Personality[];
}

const LIVING_ORDER = Number.MAX_SAFE_INTEGER - 1;
const UNKNOWN_ORDER = Number.MAX_SAFE_INTEGER;

function bucketFor(p: Personality): { key: string; label: string; order: number } {
  if (p.is_living && !p.birth_date) {
    return { key: 'living', label: 'Living', order: LIVING_ORDER };
  }
  const year = p.birth_date ? new Date(p.birth_date).getFullYear() : null;
  if (!year || Number.isNaN(year)) {
    return { key: 'unknown', label: 'Unknown', order: UNKNOWN_ORDER };
  }
  const decade = Math.floor(year / 10) * 10;
  return { key: String(decade), label: `${decade}s`, order: decade };
}

/**
 * Timeline view — groups the currently-fetched personalities into decade
 * columns by birth year. Living + Unknown go to the end. Pure presentation:
 * relies on the existing list query (no new fetch). Sort order in the parent
 * is irrelevant here — we re-bucket and order chronologically.
 */
export function PersonalitiesTimeline({ personalities }: PersonalitiesTimelineProps) {
  const buckets = useMemo<Bucket[]>(() => {
    const map = new Map<string, Bucket>();
    for (const p of personalities) {
      const { key, label, order } = bucketFor(p);
      let b = map.get(key);
      if (!b) {
        b = { label, order, items: [] };
        map.set(key, b);
      }
      b.items.push(p);
    }
    // Sort items within a bucket by view_count desc, then name.
    for (const b of map.values()) {
      b.items.sort((a, z) => z.view_count - a.view_count || a.name.localeCompare(z.name));
    }
    return Array.from(map.values()).sort((a, z) => a.order - z.order);
  }, [personalities]);

  if (buckets.length === 0) return null;

  return (
    <div
      className="overflow-x-auto pb-4 -mx-4 px-4"
      role="region"
      aria-label="Timeline of personalities by birth decade"
    >
      {/* Each decade is a segment of the line and each person a stop on it.
          The avatar IS the station ring (3px ink, `rounded-full` — the
          sanctioned circle case), so the column reads top-to-bottom as a route
          rather than as a list inside a tinted panel. */}
      <div className="flex min-w-max gap-4">
        {buckets.map((b) => (
          <div key={b.label} className="w-56 flex-shrink-0 bg-card rounded-container shadow-soft">
            <div className="sticky top-0 border-b border-border-hairline bg-foreground px-4 py-2 text-background">
              <div className="text-title font-bold leading-tight">{b.label}</div>
              <div className="text-2xs tabular-nums text-background/70">
                {b.items.length.toLocaleString()} {b.items.length === 1 ? 'person' : 'people'}
              </div>
            </div>
            <ul className="m-0 max-h-[70vh] list-none overflow-y-auto p-0">
              {b.items.map((p) => {
                const year = p.birth_date ? new Date(p.birth_date).getFullYear() : null;
                return (
                  <li key={p.id} className="border-b border-foreground/10 last:border-b-0">
                    <LocalizedLink
                      to={`/personalities/${p.slug ?? p.id}`}
                      className="flex items-center gap-2 px-4 py-2 text-inherit no-underline transition-colors hover:bg-surface-container"
                    >
                      <div
                        className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-2xs font-bold"
                        aria-hidden="true"
                      >
                        {p.image_url ? (
                          <img
                            src={p.image_url}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover object-top"
                          />
                        ) : (
                          p.name.slice(0, 1).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-13 font-bold leading-tight">{p.name}</div>
                        <div className="truncate text-2xs text-muted-foreground">
                          {year ?? ''}
                          {p.profession
                            ? `${year ? ' · ' : ''}${formatProfession(p.profession)}`
                            : ''}
                        </div>
                      </div>
                    </LocalizedLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
