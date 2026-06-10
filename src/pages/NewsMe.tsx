import { useMemo } from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { AuthGate } from '@/components/layout/AuthGate';
import { useMeta } from '@/hooks/useMeta';
import { useReadingStreak } from '@/hooks/useReadingStreak';
import { useFavorites } from '@/hooks/useFavorites';
import { useSavedNewsArticles } from '@/hooks/useSavedNewsArticles';
import { useUserNewsReadsList } from '@/hooks/useUserNewsReadsList';
import { decodeHtmlEntities } from '@/utils/htmlDecode';
import { resolveImageUrl } from '@/utils/resolveImageUrl';
import { Flame, Bookmark, BookOpen, Globe, ArrowRight } from 'lucide-react';
import { FavoriteButton } from '@/components/ui/favorite-button';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';

export default function NewsMe() {
  useMeta({
    title: 'Your reading',
    description: 'Your reading streak, saved stories, and recent reads.',
    canonicalPath: '/news/me',
  });

  return (
    <AuthGate title="Your reading" description="Sign in to see your streak, saves, and recent reads.">
      <ReaderDashboard />
    </AuthGate>
  );
}

function ReaderDashboard() {
  const { streak, loading: streakLoading } = useReadingStreak();
  const { favoriteIds } = useFavorites('news') as unknown as { favoriteIds: Set<string> };
  const { items: saved, loading: savedLoading } = useSavedNewsArticles({ limit: 50 });
  const { reads, totalReads, countriesCovered, loading: readsLoading } = useUserNewsReadsList({
    limit: 30,
  });

  const unreadSaves = useMemo(() => saved.filter((a) => !a.is_read).length, [saved]);

  return (
    <div className="container mx-auto px-4 pt-12 md:pt-16 pb-24">
      <header className="border-b border-border pb-8 mb-12">
        <p className="text-2xs uppercase tracking-[0.2em] text-muted-foreground">Your reading</p>
        <h1 className="m-0 mt-4 text-display md:text-hero font-bold leading-[0.95] tracking-tight">
          Your shelf.
        </h1>
      </header>

      {/* Numbers row — four monochrome stat tiles. */}
      <section aria-label="Reading stats" className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16">
        <StatTile
          icon={<Flame size={12} aria-hidden="true" />}
          label="Current streak"
          value={streakLoading || !streak ? '—' : streak.current_streak.toString()}
          suffix={streak ? (streak.current_streak === 1 ? 'day' : 'days') : null}
        />
        <StatTile
          icon={<BookOpen size={12} aria-hidden="true" />}
          label="Articles read"
          value={readsLoading ? '—' : totalReads.toString()}
          suffix="lifetime"
        />
        <StatTile
          icon={<Bookmark size={12} aria-hidden="true" />}
          label="Saved (unread)"
          value={savedLoading ? '—' : `${unreadSaves} / ${favoriteIds.size}`}
          suffix={null}
        />
        <StatTile
          icon={<Globe size={12} aria-hidden="true" />}
          label="Countries covered"
          value={readsLoading ? '—' : countriesCovered.toString()}
          suffix="lifetime"
        />
      </section>

      {/* Saved list */}
      <section aria-labelledby="saved-heading" className="mb-16">
        <div className="flex items-end justify-between gap-4 mb-6 border-b border-border pb-4">
          <div>
            <p className="text-2xs uppercase tracking-[0.2em] text-muted-foreground mb-1">
              Reading list
            </p>
            <h2
              id="saved-heading"
              className="m-0 text-headline-lg font-bold leading-none tracking-tight"
            >
              Saved for later.
            </h2>
          </div>
        </div>
        {savedLoading ? (
          <p className="text-sm text-muted-foreground">Loading saves…</p>
        ) : saved.length === 0 ? (
          <EmptyShelf
            line="Nothing saved yet."
            ctaTo="/news"
            ctaLabel="Browse news"
          />
        ) : (
          <ol className="m-0 p-0 list-none flex flex-col">
            {saved.map((a) => (
              <li
                key={a.id}
                className="border-b border-border last:border-b-0 py-4 flex items-baseline gap-6"
              >
                <span
                  aria-hidden="true"
                  className={`mt-2 inline-block w-2 h-2 rounded-full shrink-0 ${
                    a.is_read ? 'bg-muted-foreground/40' : 'bg-foreground'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <LocalizedLink
                    to={`/news/${a.slug}`}
                    className="block no-underline text-foreground hover:underline text-title font-semibold leading-tight"
                  >
                    {decodeHtmlEntities(a.title ?? '')}
                  </LocalizedLink>
                  <p className="mt-2 text-2xs uppercase tracking-wider text-muted-foreground">
                    {a.publisher_name && <>{a.publisher_name} · </>}
                    Saved{' '}
                    {formatDistanceToNow(new Date(a.saved_at), { addSuffix: true })}
                    {a.is_read ? ' · Read' : ''}
                  </p>
                </div>
                <FavoriteButton itemId={a.id} type="news" />
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Recent reads */}
      <section aria-labelledby="recent-heading" className="mb-16">
        <div className="flex items-end justify-between gap-4 mb-6 border-b border-border pb-4">
          <div>
            <p className="text-2xs uppercase tracking-[0.2em] text-muted-foreground mb-1">
              Recently read
            </p>
            <h2
              id="recent-heading"
              className="m-0 text-headline-lg font-bold leading-none tracking-tight"
            >
              On your trail.
            </h2>
          </div>
        </div>
        {readsLoading ? (
          <p className="text-sm text-muted-foreground">Loading reads…</p>
        ) : reads.length === 0 ? (
          <EmptyShelf
            line="You haven’t read any stories yet — that’s how the streak starts."
            ctaTo="/news"
            ctaLabel="Start reading"
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {reads.map((a) => {
              const img = resolveImageUrl({
                imageUrl: a.image_url,
                optimizedUrl: null,
                thumbnailUrl: null,
              });
              return (
                <LocalizedLink
                  key={`${a.id}-${a.read_at}`}
                  to={`/news/${a.slug}`}
                  className="group block no-underline text-inherit"
                >
                  {img && (
                    <div className="overflow-hidden rounded-container bg-muted aspect-[4/3] mb-4">
                      <img
                        src={img}
                        alt=""
                        role="presentation"
                        referrerPolicy="no-referrer"
                        loading="lazy"
                        decoding="async"
                        className="block w-full h-full object-cover transition-transform duration-[600ms] ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                      />
                    </div>
                  )}
                  <p className="text-2xs uppercase tracking-wider text-muted-foreground">
                    Read {formatDistanceToNow(new Date(a.read_at), { addSuffix: true })}
                  </p>
                  <h3 className="mt-2 m-0 text-title font-semibold leading-tight">
                    {decodeHtmlEntities(a.title ?? '')}
                  </h3>
                </LocalizedLink>
              );
            })}
          </div>
        )}
      </section>

      <div className="border-t border-border pt-8 flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
        <p className="text-base m-0">Back to the front page.</p>
        <LocalizedLink to="/news" className="no-underline">
          <Button variant="outline" className="gap-2">
            Open /news
            <ArrowRight size={16} />
          </Button>
        </LocalizedLink>
      </div>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  suffix,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  suffix: string | null;
}) {
  return (
    <div className="border border-border rounded-container p-6">
      <p className="text-2xs uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
        {icon}
        {label}
      </p>
      <p className="mt-4 m-0 text-hero font-bold leading-none tracking-tight tabular-nums">
        {value}
        {suffix && (
          <span className="ml-2 text-base font-medium text-muted-foreground tracking-normal">
            {suffix}
          </span>
        )}
      </p>
    </div>
  );
}

function EmptyShelf({
  line,
  ctaTo,
  ctaLabel,
}: {
  line: string;
  ctaTo: string;
  ctaLabel: string;
}) {
  return (
    <div className="border border-border rounded-container p-12 text-center">
      <p className="text-base m-0">{line}</p>
      <LocalizedLink to={ctaTo} className="no-underline mt-4 inline-block">
        <Button variant="outline" className="gap-2">
          {ctaLabel}
          <ArrowRight size={16} />
        </Button>
      </LocalizedLink>
    </div>
  );
}
