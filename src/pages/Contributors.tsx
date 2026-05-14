import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Skeleton } from '@/components/ui/skeleton';
import { usePublicRecognitions } from '@/hooks/useRecognitions';

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

export default function Contributors() {
  const { year: yearParam } = useParams<{ year?: string }>();
  const navigate = useNavigate();
  const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
  const validYear = Number.isFinite(year) && year >= 2024 && year <= 2100;

  useEffect(() => {
    if (!yearParam) {
      navigate(`/contributors/${new Date().getFullYear()}`, { replace: true });
    }
  }, [yearParam, navigate]);

  useEffect(() => {
    document.title = `Contributors ${year} — queer.guide`;
  }, [year]);

  const { data, isLoading } = usePublicRecognitions(validYear ? year : 0);
  const rows = data?.rows ?? [];
  const error = !validYear ? 'Invalid year' : data?.error ?? null;

  const featured = rows.filter((r) => r.featured);
  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    rows: rows.filter((r) => r.category === cat && !r.featured),
  })).filter((g) => g.rows.length > 0);

  return (
    <div className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
      <header className="border-b border-border pb-12 mb-12">
        <p className="text-sm uppercase tracking-widest text-muted-foreground mb-4">
          Recognition Wall
        </p>
        <h1 className="text-5xl sm:text-7xl font-semibold tracking-tight">{year}</h1>
        <p className="mt-6 max-w-xl text-base text-muted-foreground">
          The people who shaped queer.guide this year — venue scouts, history
          documentarians, safety reporters, translators. Names. Not a leaderboard.
        </p>
      </header>

      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-6 w-1/2" />
        </div>
      )}

      {!isLoading && rows.length === 0 && !error && (
        <p className="text-muted-foreground">
          No recognitions published for {year} yet.
        </p>
      )}

      {error && <p className="text-destructive">{error}</p>}

      {featured.length > 0 && (
        <section className="mb-16">
          <h2 className="text-sm uppercase tracking-widest text-muted-foreground mb-6">
            Featured
          </h2>
          <ul className="space-y-10">
            {featured.map((row) => (
              <li key={row.id}>
                <p className="text-2xl sm:text-3xl font-medium">{row.display_name}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {CATEGORY_LABELS[row.category] ?? row.category}
                </p>
                {row.blurb_md && (
                  <p className="mt-3 max-w-2xl text-base leading-relaxed">
                    {row.blurb_md}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {grouped.map(({ category, rows: catRows }) => (
        <section key={category} className="mb-14">
          <h2 className="text-sm uppercase tracking-widest text-muted-foreground mb-6">
            {CATEGORY_LABELS[category] ?? category}
          </h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
            {catRows.map((row) => (
              <li key={row.id}>
                <span className="text-base font-medium">{row.display_name}</span>
                {row.blurb_md && (
                  <span className="text-muted-foreground"> — {row.blurb_md}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <footer className="border-t border-border pt-8 mt-16 text-xs text-muted-foreground">
        Selected by the editorial team. Anyone can opt out of being named in their
        profile settings.
      </footer>
    </div>
  );
}
