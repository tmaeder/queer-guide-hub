import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { FilterChip } from '@/components/transit/FilterChip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
 */

const WINDOW = 40;

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

  const { formats, winnerCount } = useMemo(() => {
    const out = new Map<string, number>();
    let w = 0;
    for (const e of entries) {
      const f = e.format ?? '';
      if (f) out.set(f, (out.get(f) ?? 0) + 1);
      if (e.winner) w += 1;
    }
    return {
      formats: [...out.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
      winnerCount: w,
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
          <li key={entryKey(e)} className="border-b border-border py-4">
            <div className="flex flex-wrap items-baseline gap-2">
              <EntrantName entry={e} />
              {e.winner ? <Badge variant="ink">{t('competitions.winner', 'Winner')}</Badge> : null}
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
