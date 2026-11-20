import { ArrowRight, BookOpen, Bookmark, Flame, Globe } from '@/components/icons';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { SectionHeader } from '@/components/ui/SectionHeader';
import {
  useGuideReadingStreak as useGuideStreak,
  useContinueReadingGuides,
} from '@/hooks/useGuideReadingProgress';
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
    <div className="flex min-w-0 flex-col gap-0.5 px-4 py-2.5">
      <p className="flex items-baseline gap-1 text-title font-bold tabular-nums leading-none">
        {value}
        {suffix && <span className="text-xs font-normal text-muted-foreground">{suffix}</span>}
      </p>
      <p className="flex items-center gap-1 truncate text-2xs text-muted-foreground">
        {icon}
        {label}
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
  const {
    totalReads,
    countriesCovered,
    loading: readsLoading,
  } = useUserNewsReadsList({ limit: 1 });
  const { data: continueItems = [] } = useContinueReadingGuides(6);

  return (
    <section aria-label="Reading" className="flex flex-col gap-4">
      <SectionHeader size="section" title="Reading" />

      <div className="grid grid-cols-2 divide-border rounded-container bg-card sm:grid-cols-4 sm:divide-x">
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
        <div className="rounded-container bg-card px-4 py-2.5">
          <header className="flex items-center justify-between gap-4">
            <h3 className="text-sm font-bold">Continue reading</h3>
            <LocalizedLink
              to="/guides"
              className="inline-flex min-h-11 items-center gap-1 text-xs text-muted-foreground no-underline hover:text-foreground"
            >
              All guides <ArrowRight size={14} aria-hidden />
            </LocalizedLink>
          </header>
          <ul className="m-0 list-none divide-y divide-border p-0">
            {continueItems.map((it) => (
              <li key={it.guide_id}>
                <LocalizedLink
                  to={`/guides/${it.guide.slug}`}
                  className="group flex min-h-11 items-center gap-4 py-2 no-underline"
                >
                  <span className="min-w-0 flex-1 truncate text-sm group-hover:underline underline-offset-4">
                    {it.guide.title}
                  </span>
                  <span className="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
                    <span
                      aria-hidden
                      className="block h-full bg-foreground"
                      style={{ width: `${Math.max(4, Math.min(100, it.scroll_pct))}%` }}
                    />
                  </span>
                  <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {it.scroll_pct}%
                  </span>
                </LocalizedLink>
              </li>
            ))}
          </ul>
        </div>
      )}

      <LocalizedLink
        to="/hub/saved"
        className="inline-flex min-h-11 items-center gap-2 self-start text-xs text-muted-foreground no-underline hover:text-foreground"
      >
        <Bookmark size={14} aria-hidden />
        Saved stories live in your saved items
        <ArrowRight size={14} aria-hidden />
      </LocalizedLink>
    </section>
  );
}
