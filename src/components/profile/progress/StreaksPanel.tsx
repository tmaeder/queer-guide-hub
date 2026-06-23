import { ArrowRight, BookOpen, Bookmark, Flame, Globe } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { ProfileSectionHeader } from '@/components/profile/ProfileSectionHeader';
import { useReadingStreak as useGuideStreak, useContinueReadingGuides } from '@/hooks/useGuideReadingProgress';
import { useReadingStreak as useNewsStreak } from '@/hooks/useReadingStreak';
import { useUserNewsReadsList } from '@/hooks/useUserNewsReadsList';

function StatTile({
  icon,
  label,
  value,
  suffix,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  suffix?: string | null;
}) {
  return (
    <div className="rounded-container border border-border p-4 bg-card">
      <p className="flex items-center gap-1 text-2xs uppercase tracking-[0.1em] text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="mt-2 text-display tabular-nums leading-none">
        {value}
        {suffix && <span className="text-body-lg text-muted-foreground"> {suffix}</span>}
      </p>
    </div>
  );
}

/**
 * Reading streaks across guides + news. Guide-streak block moved from
 * MarketplaceMissions; news tiles from NewsMe (saved stories live in /favorites).
 */
export function StreaksPanel() {
  const { data: guideStreak = 0 } = useGuideStreak();
  const { streak: newsStreak, loading: newsLoading } = useNewsStreak();
  const { totalReads, countriesCovered, loading: readsLoading } = useUserNewsReadsList({ limit: 1 });
  const { data: continueItems = [] } = useContinueReadingGuides(6);

  return (
    <section aria-label="Reading" className="flex flex-col gap-4">
      <ProfileSectionHeader title="Reading" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatTile
          icon={<BookOpen size={12} aria-hidden />}
          label="Guide streak"
          value={String(guideStreak)}
          suffix={guideStreak === 1 ? 'week' : 'weeks'}
        />
        <StatTile
          icon={<Flame size={12} aria-hidden />}
          label="News streak"
          value={newsLoading || !newsStreak ? '—' : String(newsStreak.current_streak)}
          suffix={newsStreak ? (newsStreak.current_streak === 1 ? 'day' : 'days') : null}
        />
        <StatTile
          icon={<BookOpen size={12} aria-hidden />}
          label="Articles read"
          value={readsLoading ? '—' : String(totalReads)}
        />
        <StatTile
          icon={<Globe size={12} aria-hidden />}
          label="Countries covered"
          value={readsLoading ? '—' : String(countriesCovered)}
        />
      </div>

      {continueItems.length > 0 && (
        <div className="rounded-container border border-border p-6 bg-card">
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
            {continueItems.map((it) => (
              <li key={it.guide_id} className="py-2">
                <LocalizedLink
                  to={`/marketplace/guides/${it.guide.slug}`}
                  className="group flex items-center gap-4 no-underline"
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
        </div>
      )}

      <LocalizedLink
        to="/me/saved"
        className="inline-flex items-center gap-2 text-13 text-muted-foreground hover:text-foreground"
      >
        <Bookmark size={14} aria-hidden />
        Saved stories live in your saved items
        <ArrowRight size={14} aria-hidden />
      </LocalizedLink>
    </section>
  );
}
