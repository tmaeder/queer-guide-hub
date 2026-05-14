import { useMemo } from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import type { Personality } from '@/hooks/usePersonalities';

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
      <div className="flex gap-4 min-w-max">
        {buckets.map((b) => (
          <div
            key={b.label}
            className="flex-shrink-0 w-56 border border-border rounded-md bg-background"
          >
            <div className="px-3 py-2 border-b border-border sticky top-0 bg-background">
              <div className="text-sm font-semibold">{b.label}</div>
              <div className="text-xs text-muted-foreground">
                {b.items.length.toLocaleString()}{' '}
                {b.items.length === 1 ? 'person' : 'people'}
              </div>
            </div>
            <ul className="divide-y divide-border max-h-[70vh] overflow-y-auto">
              {b.items.map((p) => {
                const year = p.birth_date ? new Date(p.birth_date).getFullYear() : null;
                return (
                  <li key={p.id}>
                    <LocalizedLink
                      to={`/personalities/${p.slug ?? p.id}`}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-accent transition-colors no-underline text-inherit"
                    >
                      <div
                        className="w-8 h-8 rounded-full bg-muted overflow-hidden flex-shrink-0 flex items-center justify-center text-xs font-bold"
                        aria-hidden="true"
                      >
                        {p.image_url ? (
                          <img
                            src={p.image_url}
                            alt=""
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          p.name.slice(0, 1).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium truncate">{p.name}</div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {year ?? ''}
                          {p.profession ? `${year ? ' · ' : ''}${p.profession}` : ''}
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
