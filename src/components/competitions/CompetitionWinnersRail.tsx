import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Image } from '@/components/ui/Image';
import type { RosterEntry } from '@/types/competition';

/**
 * The photographed winners of one category, as a rail.
 *
 * THIS MODULE IS ABSENT ON THREE OF THE SIX PAGES, BY MEASUREMENT.
 *
 * `competition_roster()` carries `image_url` for 585 of 2,140 entrants, and it
 * is not spread evenly — measured on prod 2026-09-07:
 *
 *   drag_series    572 images / 1,327 entrants ·  58 of 117 winners
 *   drag_pageant    12 images /   287 entrants ·   6 of 101 winners
 *   leather_title    1 image  /    74 entrants ·   1 of  74 winners
 *   gay_title        0        ·   drag_king 0   ·   trans_pageant 0
 *
 * So a photo-led layout has nothing to lead with on half the corpus. The rule
 * this module holds is the one `PhotoInset` states — no data, no module — and
 * the reason it is stated again here is that the tempting alternatives are all
 * worse: a monogram tile, a grey box or a deterministic texture would fill a
 * rail on `/competitions/gay-titles` with 33 identical placeholders and assert
 * that we hold 33 portraits. That is the em-dash-filled column this page just
 * had, one layer up. A page with no photographs is a SHORTER page.
 *
 * `MIN_RAIL` exists because "at least one photo" is not the same question as
 * "enough photos to be a rail". Six faces of 101 titleholders, under a heading
 * that says Winners, reads as a curated selection that nobody curated — the
 * reader cannot tell that the other 95 were omitted for want of a file rather
 * than for want of merit. Eight is where a row stops looking like an accident
 * at the widths this grid uses; on today's corpus it admits `drag_series` (58)
 * and nothing else, which is the honest answer.
 *
 * A NULL `personality_slug` MEANS "DO NOT LINK", for the same safety reason
 * `CompetitionRoster` states at length: the RPC emits a slug only when the
 * linked personality row is public and not a duplicate, so synthesising one
 * would publish a working-looking link to a draft or archived person.
 */

const MIN_RAIL = 8;
/** Bounds the payload. 58 portraits is a rail nobody reaches the end of, and
 *  the roster view already holds everyone. */
const CAP = 18;

export function CompetitionWinnersRail({ entries }: { entries: RosterEntry[] }) {
  const { t } = useTranslation();

  const { shown, withPhoto, total } = useMemo(() => {
    const winners = entries.filter((e) => e.winner);
    const photographed = winners
      .filter((e) => e.image_url)
      // Most recent first. `year` is null on a handful of rows; those sort last
      // rather than being dropped, since the photograph is the point here.
      .sort((a, b) => (b.year ?? -Infinity) - (a.year ?? -Infinity));
    return {
      shown: photographed.slice(0, CAP),
      withPhoto: photographed.length,
      total: winners.length,
    };
  }, [entries]);

  if (withPhoto < MIN_RAIL) return null;

  return (
    <section className="mt-8" aria-labelledby="competition-winners-rail">
      <h2 id="competition-winners-rail" className="text-headline font-display">
        {t('competitions.winners.title', 'Winners')}
      </h2>
      <p className="mt-1 text-13 tabular-nums text-muted-foreground">
        {shown.length < withPhoto
          ? t('competitions.winners.captionCapped', {
              shown: shown.length,
              withPhoto,
              total,
            })
          : t('competitions.winners.caption', { withPhoto, total })}
      </p>

      <ul className="-mx-1 mt-4 flex list-none gap-4 overflow-x-auto p-0 px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {shown.map((e) => (
          <li key={`${e.edition_slug}/${e.name}`} className="w-[150px] shrink-0">
            <WinnerTile entry={e} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function WinnerTile({ entry }: { entry: RosterEntry }) {
  const photo = (
    <Image
      src={entry.image_url}
      // Decorative. The name is the very next element inside the same link, so
      // an alt repeating it makes the link announce "Crystal Methyd Crystal
      // Methyd RuPaul's Drag Race All Stars 2026" — the sr-only-duplicates-the-
      // visible-label defect, spelled with an alt attribute.
      alt=""
      aspect="portrait"
      imageRole="thumb"
      rounded="element"
    />
  );

  const caption = (
    <>
      <span className="mt-2 block text-15 font-bold leading-tight">{entry.name}</span>
      <span className="mt-1 block text-13 leading-tight text-muted-foreground">
        {entry.competition}
        {entry.year != null ? ` ${entry.year}` : ''}
      </span>
    </>
  );

  if (entry.personality_slug) {
    return (
      <LocalizedLink
        to={`/personalities/${entry.personality_slug}`}
        className="group block text-inherit no-underline"
      >
        {photo}
        {caption}
      </LocalizedLink>
    );
  }

  // No public page exists for this person. See the file header: never a link.
  return (
    <div>
      {photo}
      {caption}
    </div>
  );
}

export default CompetitionWinnersRail;
