import { useMeta } from '@/hooks/useMeta';
import { useAuth } from '@/hooks/useAuth';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useReadingStreak } from '@/hooks/useGuideReadingProgress';
import {
  useLocalSupporterCities,
  type LocalSupporterCity,
} from '@/hooks/useLocalSupporter';
import { useContinueReadingGuides } from '@/hooks/useGuideReadingProgress';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { PageHero } from '@/components/discovery';
import { EmptyState } from '@/components/ui/EmptyState';
import { BookOpen, MapPin, ArrowRight } from 'lucide-react';

const TIER_DESCRIPTION: Record<LocalSupporterCity['tier'], string> = {
  Visitor: 'Start saving queer-owned spots here.',
  Local: 'You\'re showing up — keep going.',
  'Local Supporter': 'Real support, consistently.',
  Champion: 'Top-tier local advocate.',
};

function SignedOutPrompt() {
  const navigate = useLocalizedNavigate();
  return (
    <div className="container mx-auto py-16 px-4">
      <EmptyState
        icon={MapPin}
        title="Sign in to track your progress."
        description="Save spots, read guides, and we'll keep a quiet record of where you support queer-owned business."
        primaryAction={{ label: 'Sign in', onClick: () => navigate('/auth') }}
      />
    </div>
  );
}

function CityRow({ city }: { city: LocalSupporterCity }) {
  return (
    <li className="border-t border-border first:border-t-0 py-5 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-title leading-tight">{city.city_name}</p>
        <p className="text-13 uppercase tracking-[0.1em] text-muted-foreground mt-1">
          {city.tier} · {TIER_DESCRIPTION[city.tier]}
        </p>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        <span className="font-mono text-display tabular-nums">{city.score}</span>
        <LocalizedLink
          to={`/cities/${encodeURIComponent(city.city_name.toLowerCase().replace(/\s+/g, '-'))}`}
          className="inline-flex items-center gap-1 text-13 text-muted-foreground hover:text-foreground"
        >
          City
          <ArrowRight size={14} aria-hidden />
        </LocalizedLink>
      </div>
    </li>
  );
}

function StreakBlock() {
  const { data: streak = 0 } = useReadingStreak();
  return (
    <section className="rounded-container border border-border p-6 bg-card">
      <p className="text-13 uppercase tracking-[0.1em] text-muted-foreground mb-2">
        Reading streak
      </p>
      <p className="text-display tabular-nums">
        {streak} <span className="text-body-lg text-muted-foreground">weeks</span>
      </p>
      <p className="text-13 text-muted-foreground mt-2">
        {streak >= 2
          ? 'Consecutive ISO weeks with at least one completed guide.'
          : 'Finish a guide each week to start a streak.'}
      </p>
    </section>
  );
}

function ContinueReadingBlock() {
  const { data: items = [] } = useContinueReadingGuides(6);
  if (items.length === 0) return null;
  return (
    <section className="rounded-container border border-border p-6 bg-card">
      <header className="flex items-center justify-between gap-4 mb-4">
        <p className="text-13 uppercase tracking-[0.1em] text-muted-foreground">
          Continue reading
        </p>
        <LocalizedLink
          to="/marketplace/guides"
          className="inline-flex items-center gap-1 text-13 text-muted-foreground hover:text-foreground"
        >
          All guides <ArrowRight size={14} aria-hidden />
        </LocalizedLink>
      </header>
      <ul className="divide-y divide-border">
        {items.map((it) => (
          <li key={it.guide_id} className="py-3">
            <LocalizedLink
              to={`/marketplace/guides/${it.guide.slug}`}
              className="group flex items-center gap-3 no-underline"
            >
              <div className="flex-1 min-w-0">
                <p className="text-15 truncate group-hover:underline underline-offset-4">
                  {it.guide.title}
                </p>
                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    aria-hidden
                    className="h-full bg-foreground"
                    style={{ width: `${Math.max(4, Math.min(100, it.scroll_pct))}%` }}
                  />
                </div>
              </div>
              <span className="text-2xs uppercase tracking-[0.1em] text-muted-foreground tabular-nums">
                {it.scroll_pct}%
              </span>
            </LocalizedLink>
          </li>
        ))}
      </ul>
    </section>
  );
}

function LocalSupporterBlock() {
  const { data: cities = [], isLoading } = useLocalSupporterCities();
  return (
    <section className="rounded-container border border-border p-6 bg-card">
      <header className="flex items-center justify-between gap-4 mb-3">
        <p className="text-13 uppercase tracking-[0.1em] text-muted-foreground">
          Local Supporter
        </p>
        <p className="text-2xs uppercase tracking-[0.1em] text-muted-foreground">
          0 — 100 per city
        </p>
      </header>
      <p className="text-13 text-muted-foreground mb-5">
        +5 per saved queer-owned spot · +10 per review · +2 per completed guide pick
        in that city. Decays −1/week for inactivity.
      </p>
      {isLoading ? (
        <p className="text-13 text-muted-foreground">Loading…</p>
      ) : cities.length === 0 ? (
        <p className="text-13 text-muted-foreground">
          No city activity yet. Save a queer-owned venue or finish a city-scoped
          guide to start a score.
        </p>
      ) : (
        <ul>
          {cities
            .slice()
            .sort((a, b) => b.score - a.score)
            .map((c) => (
              <CityRow key={c.city_id} city={c} />
            ))}
        </ul>
      )}
    </section>
  );
}

const MarketplaceMissions = () => {
  const { user } = useAuth();
  useMeta({
    title: 'Missions — Marketplace',
    description:
      'Your reading streak, in-progress guides, and Local Supporter score per city.',
    canonicalPath: '/marketplace/missions',
    noIndex: true,
  });

  if (!user) return <SignedOutPrompt />;

  return (
    <div className="min-h-screen">
      <PageHero
        eyebrow="Yours"
        title="Missions."
        lede="Quiet progress on what you read, save, and support."
        size="md"
      />
      <div className="container mx-auto py-8 md:py-12 px-4 max-w-4xl space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <StreakBlock />
          <ContinueReadingBlock />
        </div>
        <LocalSupporterBlock />
        <p className="text-13 text-muted-foreground pt-4">
          Visible only to you. Privacy controls in{' '}
          <LocalizedLink
            to="/settings/privacy"
            className="underline underline-offset-4"
          >
            settings
          </LocalizedLink>
          .
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <LocalizedLink
            to="/marketplace/guides"
            className="inline-flex items-center gap-2 rounded-element border border-border px-4 py-2 text-13 no-underline hover:bg-muted"
          >
            <BookOpen size={14} aria-hidden />
            Browse all guides
          </LocalizedLink>
          <LocalizedLink
            to="/marketplace"
            className="inline-flex items-center gap-2 rounded-element border border-border px-4 py-2 text-13 no-underline hover:bg-muted"
          >
            Back to marketplace
          </LocalizedLink>
        </div>
      </div>
    </div>
  );
};

export default MarketplaceMissions;
