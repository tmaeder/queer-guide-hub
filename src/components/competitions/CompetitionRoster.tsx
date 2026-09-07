import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { FilterChip } from '@/components/transit/FilterChip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Image } from '@/components/ui/Image';
import { Input } from '@/components/ui/input';
import type { RosterEntry } from '@/types/competition';

/**
 * Every entrant across every edition, searchable.
 *
 * A NULL `personality_slug` MEANS "DO NOT LINK", AND THAT IS A SAFETY RULE, NOT
 * A CONVENIENCE. The RPC only emits a slug when the linked personality row is
 * public and not a duplicate, so a null is the database saying this person has
 * no publicly visible page. Synthesising `/personalities/<name>` from the name
 * would publish a working-looking link to a draft or archived person — the
 * outing-risk class this codebase treats as unrecoverable. Plain text, no
 * anchor, no title attribute hinting at one.
 *
 * The badges are not decoration either: winner / runner-up / Miss Congeniality
 * are booleans on the row, and they are the only three facts a reader scanning
 * a thousand names is actually scanning FOR. They carry their own words, so
 * they survive being read aloud or printed in greyscale.
 *
 * THE PORTRAIT COLUMN IS DECIDED PER PAGE, NOT PER ROW.
 *
 * `image_url` is populated on 585 of 2,140 entrants and is wildly uneven across
 * the six categories (572 on drag_series, 12 on drag_pageant, 1 on
 * leather_title, 0 on the other three — measured on prod 2026-09-07). Two rules
 * fall out of that, and BOTH are needed:
 *
 *   1. A row with no photograph renders no photograph. Not a monogram, not a
 *      grey tile, not a deterministic texture. A placeholder for a person we
 *      hold no picture of is a claim we cannot back, and 1,555 of them is a
 *      page-long claim.
 *   2. Whether a leading COLUMN is reserved is a property of the list, not of
 *      the row, and it turns on the RATE rather than on presence. A reserved
 *      gutter buys one left edge for every name, which is worth 72px only if
 *      the column is actually a column: `leather_title` holds ONE photograph in
 *      74 entries and `drag_pageant` twelve in 287, so reserving there indents
 *      every row for a face that is on 1.4% of them — the em-dash column this
 *      page just deleted, wearing a new hat. Above `SLOT_DENSITY` the slot is
 *      kept on every row and the names align; below it the few photographs
 *      still render, inline, and the one row carrying one is simply indented by
 *      its own picture. Nothing is ever dropped for being rare, and nothing is
 *      ever reserved for being possible.
 */

const WINDOW = 40;

/**
 * Share of a category's entries that must carry a photograph before the roster
 * reserves a portrait column. Measured on prod 2026-09-07: drag_series 43%
 * (572/1,327), drag_pageant 4.2% (12/287), leather_title 1.4% (1/74), and 0%
 * for the other three. Any cut between 5% and 40% separates the same one page
 * from the same five, so the exact figure is not load-bearing; what it encodes
 * is that a column has to be populated to be worth its own gutter.
 */
const SLOT_DENSITY = 0.1;

/**
 * Chips group by FORMAT. They used to be "Drag Race / Pageants", which named
 * eleven independent competitions after what they were not — and got it wrong
 * for the leather and rubber contests, which are conventions, not pageants.
 * The list is derived from the data so a new format needs no code change.
 */
const ALL = '\u0000all';
const WINNERS = '\u0000winners';

function entryKey(e: RosterEntry): string {
  return `${e.edition_slug}/${e.name}`;
}

/** The leading portrait. `reserveSlot` is the list-level decision from rule 2:
 *  when it holds, an entry with no photograph leaves the gutter EMPTY — never
 *  filled with a stand-in — so the names keep one left edge; when it does not,
 *  such an entry has no gutter at all. */
function EntrantPortrait({ entry, reserveSlot }: { entry: RosterEntry; reserveSlot: boolean }) {
  if (!entry.image_url) return reserveSlot ? <span aria-hidden className="w-14 shrink-0" /> : null;
  return (
    // `h-14` and `self-start` are both load-bearing: as a flex item this span
    // otherwise stretches to the row's height (measured 56x70), and
    // `rounded-full` on a non-square box is an ELLIPSE, not a circle.
    <span className="h-14 w-14 shrink-0 self-start overflow-hidden rounded-full">
      <Image
        src={entry.image_url}
        // Decorative: the name is right beside it as real text, so a second
        // announcement of the same name is noise to a screen reader.
        alt=""
        aspect="square"
        imageRole="avatar"
        rounded="none"
      />
    </span>
  );
}

function EntrantName({ entry }: { entry: RosterEntry }) {
  if (entry.personality_slug) {
    return (
      <LocalizedLink
        to={`/personalities/${entry.personality_slug}`}
        className="font-bold text-foreground no-underline hover:underline"
      >
        {entry.name}
      </LocalizedLink>
    );
  }
  // No page exists for this person. See the file header — never a link.
  return <span className="font-bold">{entry.name}</span>;
}

export function CompetitionRoster({ entries }: { entries: RosterEntry[] }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<string>(ALL);
  const [showAll, setShowAll] = useState(false);

  const { formats, winnerCount, anyPhotos, reserveSlot } = useMemo(() => {
    const out = new Map<string, number>();
    let w = 0;
    let photos = 0;
    for (const e of entries) {
      const f = e.format ?? '';
      if (f) out.set(f, (out.get(f) ?? 0) + 1);
      if (e.winner) w += 1;
      if (e.image_url) photos += 1;
    }
    return {
      formats: [...out.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
      winnerCount: w,
      // Both measured over the WHOLE category, never the filtered window: a
      // search that happens to match only unphotographed entrants must not
      // collapse the column and shift every name left mid-typing.
      anyPhotos: photos > 0,
      reserveSlot: entries.length > 0 && photos / entries.length >= SLOT_DENSITY,
    };
  }, [entries]);

  const viewKey = `${kind} ${search}`;
  const [prevViewKey, setPrevViewKey] = useState(viewKey);
  if (viewKey !== prevViewKey) {
    setPrevViewKey(viewKey);
    setShowAll(false);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (kind === WINNERS && !e.winner) return false;
      if (kind !== ALL && kind !== WINNERS && (e.format ?? '') !== kind) return false;
      if (q === '') return true;
      return (
        e.name.toLowerCase().includes(q) ||
        e.competition.toLowerCase().includes(q) ||
        e.edition.toLowerCase().includes(q) ||
        (e.hometown ?? '').toLowerCase().includes(q)
      );
    });
  }, [entries, kind, search]);

  const visible = showAll ? filtered : filtered.slice(0, WINDOW);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-2 md:gap-4">
        <div className="min-w-0 flex-1 md:max-w-[480px]">
          <Input
            type="search"
            aria-label={t('competitions.roster.search', 'Search entrants')}
            placeholder={t(
              'competitions.roster.searchPlaceholder',
              'Search by name, season or hometown…',
            )}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div
          className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="group"
          aria-label={t('competitions.roster.filter', 'Filter entrants')}
        >
          <FilterChip
            active={kind === ALL}
            onClick={() => setKind(ALL)}
            className="whitespace-nowrap"
            label={`${t('competitions.kind.all', 'All')} ${entries.length}`}
          />
          <FilterChip
            active={kind === WINNERS}
            onClick={() => setKind(WINNERS)}
            className="whitespace-nowrap"
            label={`${t('competitions.roster.winnersOnly', 'Winners')} ${winnerCount}`}
          />
          {formats.map(([f, n]) => (
            <FilterChip
              key={f}
              active={kind === f}
              onClick={() => setKind(f)}
              className="whitespace-nowrap"
              label={`${f} ${n}`}
            />
          ))}
        </div>
      </div>

      <p className="mb-2 text-13 tabular-nums text-muted-foreground">
        {t('competitions.roster.count', '{{shown}} of {{total}} entrants', {
          shown: visible.length,
          total: entries.length,
        })}
      </p>

      <ul className="m-0 list-none p-0">
        {visible.map((e) => (
          <li key={entryKey(e)} className="flex gap-4 border-b border-border py-4">
            {anyPhotos && <EntrantPortrait entry={e} reserveSlot={reserveSlot} />}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <EntrantName entry={e} />
                {e.winner ? (
                  <Badge variant="ink">{t('competitions.winner', 'Winner')}</Badge>
                ) : null}
                {e.runner_up ? (
                  <Badge variant="soft">{t('competitions.runnerUp', 'Runner-up')}</Badge>
                ) : null}
                {e.miss_congeniality ? (
                  <Badge variant="outline">
                    {t('competitions.missCongeniality', 'Miss Congeniality')}
                  </Badge>
                ) : null}
              </div>

              <p className="mt-1 text-13 text-muted-foreground">
                {e.competition} · {e.edition}
                {e.placement_label ? ` · ${e.placement_label}` : null}
                {!e.placement_label && e.placement != null
                  ? ` · ${t('competitions.roster.place', 'Place {{n}}', { n: e.placement })}`
                  : null}
              </p>

              <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-13 tabular-nums text-muted-foreground">
                {e.challenge_wins != null ? (
                  <span>
                    {t('competitions.roster.challengeWins', 'Challenge wins')}: {e.challenge_wins}
                  </span>
                ) : null}
                {e.lip_syncs != null ? (
                  <span>
                    {t('competitions.roster.lipSyncs', 'Lip syncs')}: {e.lip_syncs}
                  </span>
                ) : null}
                {e.age != null ? (
                  <span>
                    {t('competitions.roster.age', 'Age')}: {e.age}
                  </span>
                ) : null}
                {e.hometown ? <span>{e.hometown}</span> : null}
              </p>
            </div>
          </li>
        ))}
      </ul>

      {!showAll && filtered.length > WINDOW ? (
        <div className="mt-4">
          <Button variant="outline" onClick={() => setShowAll(true)}>
            {t('competitions.roster.showAll', 'Show all {{n}} entrants', { n: filtered.length })}
          </Button>
        </div>
      ) : null}
      {filtered.length === 0 ? (
        <p className="mt-4 text-muted-foreground">
          {t('competitions.roster.empty', 'No entrant matches.')}
        </p>
      ) : null}
    </div>
  );
}

export default CompetitionRoster;
