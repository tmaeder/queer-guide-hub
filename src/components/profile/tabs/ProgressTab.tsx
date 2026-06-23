import type { ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import OptimizedErrorBoundary, {
  DataErrorFallback,
} from '@/components/error/OptimizedErrorBoundary';
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

/** Each section is isolated so one failing gamification query can't blank the tab. */
function Guarded({ children }: { children: ReactNode }) {
  return (
    <OptimizedErrorBoundary fallback={DataErrorFallback}>{children}</OptimizedErrorBoundary>
  );
}

/**
 * Own-only gamification surface. Absorbs the former /me/passport, /me/missions,
 * /me/leaderboard, /profile/tiers and /news/me pages. The ten sections are
 * grouped into a secondary segmented view (Score / Explore / Recognition) so
 * the surface is scannable instead of one long dump — and Radix unmounts the
 * inactive panels, so heavy queries (100-row leaderboard, full catalog) only
 * fire when their sub-tab is opened.
 */
export function ProgressTab() {
  const { data: score } = useCommunityScore();

  return (
    <div className="flex flex-col gap-6">
      <Tabs defaultValue="score" className="flex flex-col gap-6">
        <TabsList>
          <TabsTrigger value="score">Score</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="recognition">Recognition</TabsTrigger>
        </TabsList>

        <TabsContent value="score" className="flex flex-col gap-6">
          <Guarded>
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
                <DomainBreakdown breakdown={score.domain_breakdown} />
              </div>
            ) : (
              <div className="h-20 rounded-element border border-border bg-card animate-pulse" />
            )}
          </Guarded>
          <Guarded>
            <MissionsRow />
          </Guarded>
          <Guarded>
            <StreaksPanel />
          </Guarded>
        </TabsContent>

        <TabsContent value="activity" className="flex flex-col gap-6">
          <Guarded>
            <VenuesPersonalStrip />
          </Guarded>
          <Guarded>
            <LocalSupporterBlock />
          </Guarded>
          <Guarded>
            <VisitedVenuesList />
          </Guarded>
          <Guarded>
            <LeaderboardPanel />
          </Guarded>
        </TabsContent>

        <TabsContent value="recognition" className="flex flex-col gap-6">
          <Guarded>
            <AchievementsGrid />
          </Guarded>
          <Guarded>
            <TrustTierLadder />
          </Guarded>
        </TabsContent>
      </Tabs>

      <p className="text-13 text-muted-foreground">Visible only to you.</p>
    </div>
  );
}
