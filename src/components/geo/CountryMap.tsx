import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { type CountryMapData, countryMapUrl, hasCountryMap } from './countryMapIndex';

/**
 * A country's silhouette, drawn in the subway visual language.
 *
 * Geometry is precomputed from Natural Earth and committed as static JSON
 * (`public/maps/country/<iso>.json`, written by
 * `scripts/generate-country-maps.mjs`) — this fetches one and renders it.
 *
 * INLINE svg, not `<img src>`, and that is load-bearing rather than incidental:
 * `ThemeProvider` switches themes by toggling the `dark` CLASS on `<html>`, and
 * an externally-loaded SVG is a separate document that cannot see that class —
 * it only ever gets `prefers-color-scheme`. As an `<img>` the map would keep
 * light-mode polarity for anyone who flipped the toggle by hand against their
 * OS setting. Inline, every colour is a token and repaints with the class.
 *
 * Verified on prod rather than assumed: removing/adding `dark` on `<html>`
 * moves the land fill #FAFAF5 <-> #111 and the stroke with it. Note this app
 * has NO `data-theme` attribute (it reads null) — do not reach for one.
 *
 * The capital label is HTML, not SVG `<text>` — the `IntentMap` rule ("every
 * label on this map is HTML"). It gets Anton at the right optical size without
 * a hand-estimated text width, and it stays selectable and translatable.
 *
 * The dots are CITIES we cover, never venues. See the generator's header: venue
 * coordinates in criminalizing countries are what `safety_gated` + RLS exist to
 * withhold from anonymous readers, and a static asset would bypass that layer.
 */
export function CountryMap({
  code,
  name,
  className,
}: {
  /** `countries.code` — ISO-3166 alpha-2. */
  code: string | null | undefined;
  name: string;
  className?: string;
}) {
  const known = hasCountryMap(code);

  const { data } = useQuery<CountryMapData>({
    queryKey: ['country-map', code?.toUpperCase()],
    enabled: known,
    // The file is content-addressed by ISO code and only changes when the
    // generator is rerun, so it never needs refetching within a session.
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    queryFn: async () => {
      const res = await fetch(countryMapUrl(code as string));
      if (!res.ok) throw new Error(`country map ${code}: ${res.status}`);
      return res.json();
    },
  });

  // Rule 2, as PhotoInset states it: no data, no module. 13 `countries.code`
  // values have no Natural Earth geometry (overseas départements folded into
  // their parent, uninhabited islands), and those pages are simply shorter.
  if (!known) return null;

  return (
    <figure
      className={cn('bg-muted rounded-element m-0 p-4', className)}
      data-testid="country-map"
      data-country={code?.toUpperCase()}
    >
      <div className="border border-border-hairline relative">
        {data ? (
          <>
            <svg
              viewBox={`0 0 ${data.w} ${data.h}`}
              className="block h-auto w-full"
              role="img"
              aria-label={name}
            >
              <g strokeLinejoin="round">
                {/* One <path> per landmass. Concatenating them into a single
                    evenodd path makes overlapping polygons cancel and punch
                    holes in the fill — Brazil's north went transparent. */}
                {data.land.map((d, i) => (
                  <path
                    key={i}
                    d={d}
                    fillRule="evenodd"
                    className="fill-background stroke-foreground"
                    strokeWidth={3.5}
                  />
                ))}
                {data.lakes && (
                  <path
                    d={data.lakes}
                    fillRule="evenodd"
                    className="fill-track-blue"
                    fillOpacity={0.55}
                    stroke="none"
                  />
                )}
                {data.dots.map((dot, i) => (
                  <circle
                    key={i}
                    cx={dot.x}
                    cy={dot.y}
                    r={dot.c ? 11 : 9}
                    // Country's own route bullet is the yellow track, and a
                    // track-coloured fill carries the ink ring — the 1.4.11
                    // border-gating rule. `--track-ring` is ink in both modes,
                    // so it cannot invert with the theme.
                    className="fill-track-yellow stroke-track-ring"
                    strokeWidth={1.5}
                  />
                ))}
              </g>
            </svg>
            {data.label && (
              <span
                className={cn(
                  'absolute -translate-x-1/2 -translate-y-full',
                  'bg-track-yellow text-track-ring border border-track-ring',
                  'rounded-badge px-2 py-1 font-display text-2xs uppercase leading-none',
                  'whitespace-nowrap',
                  // The pin: a notch under the pill pointing at its own dot.
                  'after:absolute after:left-1/2 after:top-full after:-ml-1 after:border-4',
                  'after:border-transparent after:border-t-track-ring',
                )}
                style={{
                  left: `${(data.label.x / data.w) * 100}%`,
                  top: `${(data.label.y / data.h) * 100}%`,
                  marginTop: '-0.75rem',
                }}
              >
                {data.label.t}
              </span>
            )}
          </>
        ) : (
          // Reserve the frame at the geometry's own ratio so the page does not
          // jump when the fetch lands.
          <div className="aspect-[10/7] w-full animate-pulse bg-muted" />
        )}
      </div>
    </figure>
  );
}
