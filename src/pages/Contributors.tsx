import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Skeleton } from '@/components/ui/skeleton';
import { usePublicRecognitions, type RecognitionPublicRow } from '@/hooks/useRecognitions';
import { PageContainer } from '@/components/layout/PageContainer';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useMeta } from '@/hooks/useMeta';
import { cn } from '@/lib/utils';

const CATEGORY_LABELS: Record<string, string> = {
  venue_scout: 'Venue scouts',
  history_documentarian: 'History documentarians',
  safety_reporter: 'Safety reporters',
  translator: 'Translators',
  quest_lead: 'Quest leads',
  community: 'Community',
  editorial: 'Editorial',
};

const CATEGORY_ORDER = [
  'editorial',
  'venue_scout',
  'history_documentarian',
  'safety_reporter',
  'translator',
  'quest_lead',
  'community',
];

const FIRST_YEAR = 2024;

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('');
}

function Avatar({ row }: { row: RecognitionPublicRow }) {
  if (row.avatar_url) {
    return (
      <img
        src={row.avatar_url}
        alt=""
        className="h-12 w-12 shrink-0 rounded-full border-[3px] border-foreground bg-muted object-cover"
        loading="lazy"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-[3px] border-foreground bg-muted text-13 font-bold"
    >
      {getInitials(row.display_name)}
    </span>
  );
}

/**
 * A contributor.
 *
 * The blurb is rendered inline. It used to live behind a `motion` opacity
 * crossfade that only ran on hover and focus — decorative motion the design
 * rules disallow, and on a touch screen the text was simply unreachable. A
 * recognition wall that hides why someone is being recognised is not
 * recognising them.
 */
function ContributorCard({ row }: { row: RecognitionPublicRow }) {
  return (
    <article className="flex h-full flex-col gap-4 border-[3px] border-foreground bg-background p-4">
      <div className="flex items-center gap-4">
        <Avatar row={row} />
        {/* No category label here: every card sits under a band header that
            already names the category, and repeating it made "Venue scouts"
            appear once per contributor. */}
        <p className="min-w-0 text-title font-bold leading-tight">{row.display_name}</p>
      </div>
      {row.blurb_md && (
        <p className="text-13 leading-relaxed text-muted-foreground">{row.blurb_md}</p>
      )}
    </article>
  );
}

function YearSwitcher({ year }: { year: number }) {
  const thisYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = thisYear; y >= FIRST_YEAR; y--) years.push(y);
  if (years.length < 2) return null;

  return (
    <nav aria-label="Year" className="inline-flex border-2 border-foreground">
      {years.map((y, i) => (
        <LocalizedLink
          key={y}
          to={`/contributors/${y}`}
          aria-current={y === year ? 'page' : undefined}
          className={cn(
            'px-4 py-2 text-13 font-bold tabular-nums no-underline transition-colors',
            i > 0 && 'border-l-2 border-foreground',
            y === year
              ? 'bg-foreground text-background'
              : 'bg-background text-foreground hover:bg-surface-container',
          )}
        >
          {y}
        </LocalizedLink>
      ))}
    </nav>
  );
}

export default function Contributors() {
  const { year: yearParam } = useParams<{ year?: string }>();
  const navigate = useNavigate();
  const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
  const validYear = Number.isFinite(year) && year >= FIRST_YEAR && year <= 2100;

  useEffect(() => {
    if (!yearParam) {
      navigate(`/contributors/${new Date().getFullYear()}`, { replace: true });
    }
  }, [yearParam, navigate]);

  useMeta({
    title: `Contributors ${year}`,
    description: `The people who shaped queer.guide in ${year}.`,
    canonicalPath: `/contributors/${year}`,
  });

  const { data, isLoading } = usePublicRecognitions(validYear ? year : 0);
  const rows = data?.rows ?? [];
  const error = !validYear ? 'Invalid year' : (data?.error ?? null);

  const featured = rows.filter((r) => r.featured);
  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    rows: rows.filter((r) => r.category === cat && !r.featured),
  })).filter((g) => g.rows.length > 0);

  return (
    <PageContainer>
      <header className="border-b-4 border-foreground pb-6">
        <p className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
          Recognition wall
        </p>
        <h1 className="mt-4 font-display text-hero leading-none tracking-tight tabular-nums md:text-hero-xl">
          {year}
        </h1>
        <p className="mt-4 max-w-xl text-body-lg text-muted-foreground">
          The people who shaped queer.guide this year — venue scouts, history documentarians, safety
          reporters, translators. Names. Not a leaderboard.
        </p>
        <div className="mt-6">
          <YearSwitcher year={year} />
        </div>
      </header>

      {isLoading && (
        <div className="mt-12 space-y-4">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-6 w-1/2" />
        </div>
      )}

      {!isLoading && rows.length === 0 && !error && (
        <p className="mt-12 text-body-lg text-muted-foreground">
          No recognitions published for {year} yet.
        </p>
      )}

      {error && <p className="mt-12 text-body-lg text-destructive">{error}</p>}

      {featured.length > 0 && (
        <section className="mt-12" aria-labelledby="featured">
          <h2
            id="featured"
            className="border-b-[3px] border-foreground bg-foreground px-4 py-2 text-title font-bold leading-tight text-background"
          >
            Featured
          </h2>
          <ul className="mt-6 flex flex-col gap-8">
            {featured.map((row) => (
              <li key={row.id}>
                <p className="font-display text-headline leading-tight md:text-display">
                  {row.display_name}
                </p>
                <p className="mt-1 text-2xs font-bold uppercase tracking-label text-muted-foreground">
                  {CATEGORY_LABELS[row.category] ?? row.category}
                </p>
                {row.blurb_md && (
                  <p className="mt-4 max-w-2xl text-body-lg leading-relaxed">{row.blurb_md}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {grouped.map(({ category, rows: catRows }) => (
        <section key={category} className="mt-12" aria-labelledby={`cat-${category}`}>
          <h2
            id={`cat-${category}`}
            className="border-b-[3px] border-foreground bg-foreground px-4 py-2 text-title font-bold leading-tight text-background"
          >
            {CATEGORY_LABELS[category] ?? category}
            <span className="ml-2 text-2xs tabular-nums text-background/70">{catRows.length}</span>
          </h2>
          <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {catRows.map((row) => (
              <li key={row.id}>
                <ContributorCard row={row} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      <footer className="mt-16 border-t-2 border-foreground pt-6 text-13 text-muted-foreground">
        Selected by the editorial team. Anyone can opt out of being named in their profile settings.
      </footer>
    </PageContainer>
  );
}
