import { ArrowRight, Compass, Sparkles, Trophy } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { ScoreLevelChip } from '@/components/score/ScoreLevelChip';
import { DomainBreakdown } from '@/components/score/DomainBreakdown';
import { MissionsRow } from '@/components/profile/MissionsRow';
import { AchievementsRow } from '@/components/profile/AchievementsRow';
import { useCommunityScore } from '@/hooks/useCommunityScore';

function QuickLink({
  to,
  icon: Icon,
  title,
  subtitle,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
}) {
  return (
    <LocalizedLink
      to={to}
      className="group flex items-center gap-4 rounded-container border border-border bg-card p-4 hover:bg-muted/30 transition-colors"
    >
      <Icon className="h-5 w-5 text-foreground" aria-hidden />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-13 text-muted-foreground">{subtitle}</p>
      </div>
      <ArrowRight
        className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform"
        aria-hidden
      />
    </LocalizedLink>
  );
}

/** Own-only gamification surface: score, missions, achievements, streaks. */
export function ProgressTab() {
  const { data: score } = useCommunityScore();

  return (
    <div className="flex flex-col gap-6">
      {score ? (
        <div className="flex flex-col gap-2">
          <ScoreLevelChip
            level={score.level}
            tier={score.tier}
            totalPoints={score.total_points}
            progress={score.progress}
          />
          {score.weekly_delta !== 0 && (
            <p className="px-1 text-13 tabular-nums text-muted-foreground">
              {score.weekly_delta > 0 ? '+' : ''}
              {score.weekly_delta} this week
              {score.pointsToNext > 0 && ` · ${score.pointsToNext} to L${score.level + 1}`}
            </p>
          )}
        </div>
      ) : (
        <div className="h-20 rounded-element border border-border bg-card animate-pulse" />
      )}

      <MissionsRow />
      <AchievementsRow />
      {score && <DomainBreakdown breakdown={score.domain_breakdown} />}

      <section className="grid gap-4 md:grid-cols-3" aria-label="Progress detail">
        <QuickLink to="/me/passport" icon={Trophy} title="Passport" subtitle="Achievements, cities, streaks." />
        <QuickLink to="/me/missions" icon={Compass} title="Missions" subtitle="Reading streak and Local Supporter." />
        <QuickLink to="/me/leaderboard" icon={Sparkles} title="Leaderboard" subtitle="See where you rank." />
      </section>

      <p className="text-13 text-muted-foreground">Visible only to you.</p>
    </div>
  );
}
