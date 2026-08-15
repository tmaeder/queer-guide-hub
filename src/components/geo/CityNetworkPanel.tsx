import { CityNetwork } from '@/components/home/subway/CityNetwork';
import { hasCityNetwork, CITY_NETWORKS } from '@/components/home/subway/cityNetworkGeometry';
import { TRACK_BG, type Track } from '@/components/transit/routeBulletMap';

/**
 * The city's real rapid-transit network, as information rather than ornament.
 *
 * Same generated geometry the homepage cards use, with two differences that
 * matter:
 *
 * 1. **It only renders for cities that actually have one.** `CityNetwork`
 *    falls back to a template squiggle so a card grid never has a hole; on a
 *    single, under a heading about getting around, that squiggle would be a
 *    false claim about 99.3% of cities. `hasCityNetwork` is the gate.
 * 2. **The line refs are rendered as a legend**, so the diagram says something
 *    a reader can act on ("U1, U2, S7") instead of being decoration. That is
 *    also why this one is not `aria-hidden` at the panel level — the legend is
 *    the accessible text, and the SVG stays hidden beneath it.
 *
 * This is the sanctioned four-track surface (see `docs/design-system/README.md`
 * § City network diagrams). It is deliberately placed in the page BODY, far
 * from the safety verdict in the rail: the four-hue wayfinding vocabulary must
 * never sit in the same viewport as a risk badge.
 */
export function CityNetworkPanel({
  slug,
  caption,
  linesLabel,
}: {
  slug: string | null | undefined;
  caption?: string;
  /** Accessible name for the legend list, e.g. "Lines". */
  linesLabel: string;
}) {
  if (!hasCityNetwork(slug)) return null;
  const network = CITY_NETWORKS[slug as string];

  return (
    <div className="border-[3px] border-foreground p-4">
      <div className="border-2 border-foreground px-2 py-2">
        <CityNetwork slug={slug ?? null} index={0} />
      </div>
      <p className="mt-2 text-2xs font-bold uppercase tracking-label text-muted-foreground">
        {linesLabel}
      </p>
      <ul className="mt-2 flex list-none flex-wrap gap-2 p-0">
        {network.lines.map((line) => (
          <li key={line.ref} className="flex items-center gap-2 text-13 font-bold">
            <span
              aria-hidden="true"
              className={`h-1.5 w-6 shrink-0 border border-foreground ${TRACK_BG[line.track as Track]}`}
            />
            {line.ref}
          </li>
        ))}
      </ul>
      {caption && <p className="mt-2 text-13 leading-relaxed text-muted-foreground">{caption}</p>}
    </div>
  );
}
