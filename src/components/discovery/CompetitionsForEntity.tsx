import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { SingleSection } from '@/components/transit/SinglePage';
import { useCompetitionHistory } from '@/hooks/useCompetitions';

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
      <ul className="space-y-4">
        {data.map((row) => (
          <li
            key={`${row.edition_slug}-${row.name}`}
            className="rounded-element border border-border-hairline bg-card p-4"
          >
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <LocalizedLink
                to={`/competitions?view=grid&edition=${encodeURIComponent(row.edition_slug)}`}
                className="text-15 font-bold no-underline"
              >
                {row.edition}
              </LocalizedLink>
              {row.year != null && (
                <span className="text-13 tabular-nums text-muted-foreground">{row.year}</span>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              {/* Colour is never the only cue — each state carries its own word. */}
              {row.winner && <Badge>{t('competitions.winner', 'Winner')}</Badge>}
              {row.runner_up && (
                <Badge variant="outline">{t('competitions.runnerUp', 'Runner-up')}</Badge>
              )}
              {row.miss_congeniality && (
                <Badge variant="outline">
                  {t('competitions.missCongeniality', 'Miss Congeniality')}
                </Badge>
              )}
              {!row.winner && !row.runner_up && row.placement_label && (
                <span className="text-13 text-muted-foreground">{row.placement_label}</span>
              )}
            </div>

            {(row.challenge_wins || row.lip_syncs) && (
              <p className="mt-2 text-13 tabular-nums text-muted-foreground">
                {row.challenge_wins
                  ? `${t('competitions.challengeWins', 'Challenge wins')}: ${row.challenge_wins}`
                  : null}
                {row.challenge_wins && row.lip_syncs ? ' · ' : null}
                {row.lip_syncs
                  ? `${t('competitions.lipSyncs', 'Lip syncs')}: ${row.lip_syncs}`
                  : null}
              </p>
            )}

            {/* The stage name used in that season can differ from the person's
                current name (queens rebrand), so it is worth showing when it
                does rather than silently presenting today's name as historical. */}
            {row.name && (
              <p className="mt-1 text-2xs uppercase tracking-wide text-muted-foreground">
                {row.name}
              </p>
            )}
          </li>
        ))}
      </ul>
    </SingleSection>
  );
}
