import { useEffect, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Compass,
  MapPin,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { PageHeader } from '@/components/layout/PageHeader';
import { useCommunityScore } from '@/hooks/useCommunityScore';
import { useStatus } from '@/hooks/useStatus';
import { StatusBar } from '@/components/status/StatusBar';
import { StatusPicker } from '@/components/status/StatusPicker';
import { ScoreLevelChip } from '@/components/score/ScoreLevelChip';
import { DomainBreakdown } from '@/components/score/DomainBreakdown';
import { CompletionNudge } from '@/components/profile/CompletionNudge';
import { ActivityStrip } from '@/components/profile/ActivityStrip';
import { AchievementsRow } from '@/components/profile/AchievementsRow';
import { MissionsRow } from '@/components/profile/MissionsRow';

interface QuickLinkProps {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
}

function QuickLink({ to, icon: Icon, title, subtitle }: QuickLinkProps) {
  return (
    <LocalizedLink
      to={to}
      className="group flex items-center gap-3 rounded-container border border-border bg-card p-4 hover:bg-muted/30 transition-colors"
    >
      <Icon className="h-5 w-5 text-foreground" aria-hidden />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-13 text-muted-foreground">{subtitle}</p>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" aria-hidden />
    </LocalizedLink>
  );
}

export default function Me() {
  const { user } = useAuth();
  const navigate = useLocalizedNavigate();
  const { profile, loading: profileLoading } = useProfile();
  const { data: score } = useCommunityScore();
  const { status } = useStatus();
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);

  useEffect(() => {
    if (!profileLoading && !user) navigate('/auth');
  }, [profileLoading, user, navigate]);

  if (!user) return null;

  const completionPct =
    ((profile as unknown as Record<string, unknown>)?.profile_completion_percentage as
      | number
      | undefined) ?? 0;

  return (
    <div className="container mx-auto py-8 px-4 flex flex-col gap-6 pb-24">
      <PageHeader
        title={`Hi${profile?.display_name ? `, ${profile.display_name}` : ''}`}
        subtitle="Your status, progress, and what's next on queer.guide."
      />

      <CompletionNudge percent={completionPct} />

      <section className="grid gap-4 md:grid-cols-[2fr_1fr]">
        {/* Status — click-to-edit */}
        {(status?.emoji || status?.text || status?.dndActive || status?.travel || (status?.tags?.length ?? 0) > 0) ? (
          <StatusBar status={status} onClick={() => setStatusPickerOpen(true)} />
        ) : (
          <button
            type="button"
            onClick={() => setStatusPickerOpen(true)}
            className="rounded-container border border-dashed border-border bg-card p-4 text-left hover:bg-muted/30 transition-colors"
          >
            <p className="text-sm font-medium text-foreground">Set a status</p>
            <p className="text-13 text-muted-foreground">
              Mood, availability, travel mode, do-not-disturb. All invisible by default.
            </p>
          </button>
        )}

        {/* Score panel */}
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
      </section>

      <MissionsRow />

      <AchievementsRow />

      {score && <DomainBreakdown breakdown={score.domain_breakdown} />}

      <ActivityStrip />

      <section className="grid gap-3 md:grid-cols-3" aria-label="Quick links">
        <QuickLink
          to="/me/passport"
          icon={Trophy}
          title="Passport"
          subtitle="Achievements, cities, streaks."
        />
        <QuickLink
          to="/me/missions"
          icon={Compass}
          title="Missions"
          subtitle="Reading streak and Local Supporter."
        />
        <QuickLink
          to="/me/leaderboard"
          icon={Sparkles}
          title="Leaderboard"
          subtitle="See where you rank."
        />
      </section>

      <section className="grid gap-3 md:grid-cols-2" aria-label="Continue">
        <QuickLink
          to="/marketplace/guides"
          icon={BookOpen}
          title="Continue reading"
          subtitle="Pick up a guide you started."
        />
        <QuickLink
          to="/venues"
          icon={MapPin}
          title="Find a venue"
          subtitle="Personalized to your interests."
        />
      </section>

      <StatusPicker open={statusPickerOpen} onOpenChange={setStatusPickerOpen} />
    </div>
  );
}
