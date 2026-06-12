import { ScoreLevelChip } from '@/components/score/ScoreLevelChip';
import { DomainBreakdown } from '@/components/score/DomainBreakdown';
import { MissionsRow } from '@/components/profile/MissionsRow';
import { VenuesPersonalStrip } from '@/components/venues/VenuesPersonalStrip';
import { AchievementsGrid } from '@/components/profile/progress/AchievementsGrid';
import { VisitedVenuesList } from '@/components/profile/progress/VisitedVenuesList';
import { StreaksPanel } from '@/components/profile/progress/StreaksPanel';
import { LocalSupporterBlock } from '@/components/profile/progress/LocalSupporterBlock';
import { LeaderboardPanel } from '@/components/profile/progress/LeaderboardPanel';
import { TrustTierLadder } from '@/components/profile/progress/TrustTierLadder';
import { useCommunityScore } from '@/hooks/useCommunityScore';

/**
 * Own-only gamification surface: score, missions, streaks, achievements,
 * check-ins, leaderboard, trust tier. Absorbs the former /me/passport,
 * /me/missions, /me/leaderboard, /profile/tiers and /news/me pages.
 */
export function ProgressTab() {
  const { data: score } = useCommunityScore();

  return (
    <div className="flex flex-col gap-8">
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

      {score && <DomainBreakdown breakdown={score.domain_breakdown} />}

      <MissionsRow />

      <VenuesPersonalStrip />

      <StreaksPanel />

      <LocalSupporterBlock />

      <AchievementsGrid />

      <VisitedVenuesList />

      <LeaderboardPanel />

      <TrustTierLadder />

      <p className="text-13 text-muted-foreground">Visible only to you.</p>
    </div>
  );
}
