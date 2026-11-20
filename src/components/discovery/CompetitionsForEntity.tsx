import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { SingleSection } from '@/components/transit/SinglePage';
import { useCompetitionHistory } from '@/hooks/useCompetitions';
import { Trophy } from '@/components/icons';

/**
 * The reciprocal half of the competition spine, on a personality page: every
 * Drag Race season and title-contest edition this person competed in.
 *
 * Same shape and placement as `MilestonesForEntity` — a compact per-entity
 * discovery block inside `EntityDetailLayout`. Renders NOTHING when the person
 * has no appearances, which is the overwhelming majority of the 16k
 * personalities, so it costs nothing on those pages.
 *
 * Ordered newest first by the RPC. A queen who competed several times gets
 * several rows: the grain is an appearance, not a person, which is what makes
 * the returning-queen story legible ("Shangela, seasons 2 and 3").
 */
export function CompetitionsForEntity({
  personalityId,
  heading,
}: {
  personalityId: string | undefined;
  heading?: string;
}) {
  const { t } = useTranslation();
  const { data } = useCompetitionHistory(personalityId);
  if (!data?.length) return null;

  return (
    <SingleSection title={heading ?? t('competitions.forPerson', 'Drag Race & title contests')}>
      <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {data.map((row) => {
          const result = row.winner
            ? t('competitions.winner', 'Winner')
            : row.runner_up
              ? t('competitions.runnerUp', 'Runner-up')
              : (row.placement_label ?? null);
          return (
            <li
              key={`${row.edition_slug}-${row.name}`}
              className="relative flex flex-col gap-4 rounded-container bg-card p-6 shadow-soft card-lift"
            >
              <div className="flex items-start gap-4">
                <span
                  aria-hidden
                  className={`grid size-12 shrink-0 place-items-center rounded-full ${
                    row.winner ? 'bg-foreground text-background' : 'bg-muted'
                  }`}
                >
                  <Trophy className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  {row.year != null && (
                    <p className="text-2xs font-bold uppercase tracking-label tabular-nums text-muted-foreground">
                      {row.year}
                    </p>
                  )}
                  <h3 className="text-15 font-bold leading-snug">
                    <LocalizedLink
                      to={`/competitions?view=grid&edition=${encodeURIComponent(row.edition_slug)}`}
                      className="no-underline after:absolute after:inset-0 after:rounded-container hover:underline"
                    >
                      {row.edition}
                    </LocalizedLink>
                  </h3>
                  {/* The stage name used that season can differ from today's
                      name (queens rebrand), so it is shown as historical fact. */}
                  {row.name && (
                    <p className="text-13 text-muted-foreground">
                      {t('competitions.competedAs', {
                        defaultValue: 'as {{name}}',
                        name: row.name,
                      })}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Colour is never the only cue — each state carries its own word. */}
                {result && <Badge variant={row.winner ? 'default' : 'outline'}>{result}</Badge>}
                {row.miss_congeniality && (
                  <Badge variant="outline">
                    {t('competitions.missCongeniality', 'Miss Congeniality')}
                  </Badge>
                )}
              </div>

              {(row.challenge_wins || row.lip_syncs) && (
                <dl className="mt-auto grid grid-cols-2 gap-2">
                  <div className="rounded-element bg-muted px-4 py-2">
                    <dt className="text-2xs uppercase tracking-label text-muted-foreground">
                      {t('competitions.challengeWins', 'Challenge wins')}
                    </dt>
                    <dd className="m-0 text-title font-bold tabular-nums">
                      {row.challenge_wins ?? 0}
                    </dd>
                  </div>
                  <div className="rounded-element bg-muted px-4 py-2">
                    <dt className="text-2xs uppercase tracking-label text-muted-foreground">
                      {t('competitions.lipSyncs', 'Lip syncs')}
                    </dt>
                    <dd className="m-0 text-title font-bold tabular-nums">{row.lip_syncs ?? 0}</dd>
                  </div>
                </dl>
              )}
            </li>
          );
        })}
      </ul>
    </SingleSection>
  );
}
