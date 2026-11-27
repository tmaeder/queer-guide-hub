import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useBreadcrumbs } from '@/contexts/BreadcrumbContext';
import { useCanonicalProfession, usePersonalitiesByProfession } from '@/hooks/usePageFetchers';
import { useMeta } from '@/hooks/useMeta';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft } from '@/components/icons';
import { PersonalityCard } from '@/components/personalities/PersonalityCard';
import { useEntityImageAssets } from '@/hooks/useEntityImageAssets';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { PageContainer } from '@/components/layout/PageContainer';
import { calculateAge } from '@/lib/personAge';
import { Input } from '@/components/ui/input';
import { personalityProfessionLabel } from '@/lib/professionDisplay';
import { formatCount } from '@/lib/previewCount';
import {
  eraOptions,
  filterProfessionPeople,
  nationalityOptions,
  type BirthEra,
  type ProfessionPerson,
} from '@/lib/professionPeople';

/** Bounded pages: the archive for a large profession is hundreds of people. */
const PAGE_SIZE = 24;

const ERA_LABELS: Record<BirthEra, [string, string]> = {
  pre1900: ['pages.professions.eraPre1900', 'Born before 1900'],
  '1900s': ['pages.professions.era1900', 'Born 1900 to 1949'],
  '1950s': ['pages.professions.era1950', 'Born 1950 to 1979'],
  '1980s': ['pages.professions.era1980', 'Born 1980 or later'],
};

function yearOf(date: unknown): string | null {
  const m = typeof date === 'string' ? date.match(/^-?\d{1,4}/) : null;
  return m ? m[0] : null;
}

interface ProfessionData {
  name: string;
  personalities: Record<string, unknown>[];
  totalCount: number;
}

export default function ProfessionDetail() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || i18n.language;
  const [query, setQuery] = useState('');
  const [nationality, setNationality] = useState('');
  const [era, setEra] = useState<BirthEra | ''>('');
  const [visible, setVisible] = useState(PAGE_SIZE);
  // A phone gets the compact list by default: one portrait card filled most of
  // the viewport. Either view stays one tap away.
  const [view, setView] = useState<'cards' | 'list'>(() =>
    typeof window !== 'undefined' && window.matchMedia?.('(max-width: 639px)').matches
      ? 'list'
      : 'cards',
  );
  const { professionName } = useParams<{ professionName: string }>();
  const navigate = useLocalizedNavigate();
  const [professionData, setProfessionData] = useState<ProfessionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Narrowed server-side to this profession. The hook matches it as a substring
  // SUPERSET, because `profession` holds a comma-separated list; the exact
  // comma-token comparison in the effect below still decides what renders.
  // Without it the query fetched the whole table and hit PostgREST's hard
  // 1000-row cap, so professions late in the alphabet lost people silently.
  const decodedProfession = professionName ? decodeURIComponent(professionName) : undefined;
  const {
    data: personalities,
    isLoading: loading,
    error: queryError,
  } = usePersonalitiesByProfession(decodedProfession);

  const professionPersonalityIds = (professionData?.personalities ?? []).map(
    (p) => (p as { id: string }).id,
  );
  const { assets: imageAssets } = useEntityImageAssets('personality', professionPersonalityIds);

  // Self-heal a legacy URL. The German normalization rewrote every stored value,
  // so `/professions/Schauspieler%2Fin` and the other ~1,440 pre-normalization
  // spellings now match nobody. Ask the same normalizer the column went through
  // and redirect once, rather than shipping a redirect table. Only fires on the
  // empty-result path, so a live profession never pays for it.
  const noMatches = !loading && !queryError && professionData?.totalCount === 0;
  const { data: canonicalProfession } = useCanonicalProfession(decodedProfession, noMatches);

  useEffect(() => {
    if (!noMatches || !canonicalProfession || !decodedProfession) return;
    if (canonicalProfession.toLowerCase() === decodedProfession.toLowerCase()) return;
    navigate(`/professions/${encodeURIComponent(canonicalProfession)}`, { replace: true });
  }, [noMatches, canonicalProfession, decodedProfession, navigate]);

  useEffect(() => {
    if (!professionName) return;
    if (queryError) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
      setError('Failed to load profession data');
      return;
    }
    if (!personalities || !decodedProfession) return;
    const filtered = (personalities as Array<{ profession?: string | null }>).filter(
      (p) =>
        p.profession &&
        p.profession
          .split(',')
          .map((prof: string) => prof.trim().toLowerCase())
          .includes(decodedProfession.toLowerCase()),
    ) as Record<string, unknown>[];
    setProfessionData({
      name: decodedProfession,
      personalities: filtered,
      totalCount: filtered.length,
    });
  }, [professionName, decodedProfession, personalities, queryError]);

  const handleBack = () => {
    navigate('/personalities');
  };

  useBreadcrumbs(
    professionData
      ? [
          { label: t('breadcrumb.personalities', 'People'), href: '/personalities' },
          { label: professionData.name },
        ]
      : null,
  );

  // Every one of these ~233 pages shared the site-default <title> and had no
  // description or canonical, so they were mutually indistinguishable to a crawler.
  // Worth fixing now and not before: until the German normalization landed, the
  // profession names these titles are built from were values like
  // "Schauspieler/in" and "Musik-", so a unique title would have been a uniquely
  // broken one. Canonical is the DECODED name re-encoded, so
  // /professions/Drag%20queen and /professions/Drag+queen collapse to one URL.
  useMeta({
    title: professionData ? `${professionData.name} — LGBTQ+ People | Queer Guide` : undefined,
    description: professionData
      ? `${professionData.totalCount} LGBTQ+ ${professionData.totalCount === 1 ? 'person' : 'people'} in the Queer Guide archive whose work is recorded under ${professionData.name}.`
      : undefined,
    canonicalPath: professionData
      ? `/professions/${encodeURIComponent(professionData.name)}`
      : undefined,
    // 161 of the 233 profession pages have ZERO publicly visible people — the
    // corpus is mostly drafts, and `personalities` RLS hides them from anon. Giving
    // all 233 a unique title without this would have invited Google to index 161
    // empty pages, which is thin content at a scale that hurts the whole domain.
    // Measured, not assumed: 161 zero / 41 one-or-two / 31 three-plus.
    // A page that gains people starts indexing itself on the next crawl.
    noIndex: !professionData || professionData.totalCount === 0,
  });

  const people = useMemo(
    () =>
      (professionData?.personalities ?? []) as unknown as (ProfessionPerson &
        Record<string, unknown>)[],
    [professionData],
  );
  const countries = useMemo(() => nationalityOptions(people), [people]);
  const eras = useMemo(() => eraOptions(people), [people]);
  const filtered = useMemo(
    () =>
      filterProfessionPeople(people, {
        query,
        nationality: nationality || null,
        era: era || null,
      }),
    [people, query, nationality, era],
  );
  const shown = filtered.slice(0, visible);

  if (loading) {
    return (
      <PageContainer>
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-4">
            <Skeleton style={{ height: 40, width: 96 }} />
            <Skeleton style={{ height: 32, width: 256 }} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="overflow-hidden">
                <Skeleton style={{ aspectRatio: '1/1', width: '100%' }} />
                <div className="p-4 flex flex-col gap-2">
                  <Skeleton style={{ height: 16, width: '100%' }} />
                  <Skeleton style={{ height: 12, width: 64 }} />
                </div>
              </Card>
            ))}
          </div>
        </div>
      </PageContainer>
    );
  }

  if (error || !professionData) {
    return (
      <PageContainer>
        <Card style={{ borderColor: 'hsl(var(--destructive))' }}>
          <CardContent className="p-6 text-center">
            <p className="text-destructive">
              {error || t('pages.professions.notFound', 'Profession not found')}
            </p>
            <Button variant="outline" onClick={handleBack} className="mt-4">
              <ArrowLeft size={16} className="mr-2" />
              {t('pages.professions.backToPeople', 'Back to people')}
            </Button>
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  const birthplaceCount = new Set(
    professionData.personalities.map((person) => person.birth_place).filter(Boolean),
  ).size;
  const ages = professionData.personalities
    .map((person) =>
      calculateAge(person.birth_date as string | null, person.death_date as string | null),
    )
    .filter((age): age is number => age !== null);
  const youngest = ages.length > 0 ? Math.min(...ages) : null;
  const oldest = ages.length > 0 ? Math.max(...ages) : null;
  const includesDeceased = professionData.personalities.some((person) => person.death_date);

  const professionLabel = personalityProfessionLabel(professionData.name, t) ?? professionData.name;
  const resetPaging = () => setVisible(PAGE_SIZE);
  const selectClass =
    'h-10 rounded-element border border-input bg-background px-2 text-base md:text-13';

  return (
    <PageContainer>
      <div className="flex flex-col gap-6">
        <header>
          <LocalizedLink
            to="/personalities"
            className="text-13 font-medium underline underline-offset-4"
          >
            {t('breadcrumb.personalities', 'People')}
          </LocalizedLink>
          <h1 className="mt-2 break-words font-display text-headline leading-tight md:text-display">
            {professionLabel}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {t('pages.professions.peopleCount', {
              defaultValue: '{{formatted}} people in the Queer Guide archive',
              count: professionData.totalCount,
              formatted: formatCount(professionData.totalCount, lang),
            })}
          </p>
        </header>

        {people.length > 0 && (
          <div
            role="search"
            aria-label={t('pages.professions.filtersLabel', 'Find people')}
            className="flex flex-wrap items-end gap-4"
          >
            <label className="flex min-w-0 flex-1 basis-48 flex-col gap-1 text-13 font-medium">
              {t('pages.professions.searchName', 'Search by name')}
              <Input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  resetPaging();
                }}
              />
            </label>
            {countries.length > 0 && (
              <label className="flex flex-col gap-1 text-13 font-medium">
                {t('pages.professions.country', 'Country')}
                <select
                  className={selectClass}
                  value={nationality}
                  onChange={(e) => {
                    setNationality(e.target.value);
                    resetPaging();
                  }}
                >
                  <option value="">{t('pages.professions.allCountries', 'All countries')}</option>
                  {countries.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {eras.length > 0 && (
              <label className="flex flex-col gap-1 text-13 font-medium">
                {t('pages.professions.era', 'Born')}
                <select
                  className={selectClass}
                  value={era}
                  onChange={(e) => {
                    setEra(e.target.value as BirthEra | '');
                    resetPaging();
                  }}
                >
                  <option value="">{t('pages.professions.anyEra', 'Any time')}</option>
                  {eras.map((id) => (
                    <option key={id} value={id}>
                      {t(ERA_LABELS[id][0], ERA_LABELS[id][1])}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div
              role="group"
              aria-label={t('pages.professions.viewLabel', 'View')}
              className="flex gap-2"
            >
              {(['cards', 'list'] as const).map((v) => (
                <Button
                  key={v}
                  type="button"
                  size="sm"
                  variant={view === v ? 'default' : 'outline'}
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                >
                  {v === 'cards'
                    ? t('pages.professions.viewCards', 'Cards')
                    : t('pages.professions.viewList', 'List')}
                </Button>
              ))}
            </div>
          </div>
        )}

        <section aria-labelledby="profession-people">
          <h2 id="profession-people" className="sr-only">
            {t('pages.professions.peopleHeading', 'People')}
          </h2>
          {people.length > 0 && (
            <p className="mb-4 text-13 text-muted-foreground" aria-live="polite">
              {t('pages.professions.showingOf', 'Showing {{shown}} of {{total}}', {
                shown: formatCount(shown.length, lang),
                total: formatCount(filtered.length, lang),
              })}
            </p>
          )}
          {shown.length > 0 ? (
            view === 'cards' ? (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {shown.map((personality) => {
                  const asset = imageAssets.get(personality.id);
                  return (
                    <PersonalityCard
                      key={personality.id}
                      personality={personality as never}
                      optimizedUrl={asset?.optimized_url}
                      thumbnailUrl={asset?.thumbnail_url}
                    />
                  );
                })}
              </div>
            ) : (
              <ul className="m-0 flex list-none flex-col p-0">
                {shown.map((person) => {
                  const born = yearOf(person.birth_date);
                  const died = yearOf(person.death_date);
                  const years = born ? (died ? `${born}–${died}` : born) : null;
                  const slug = (person as { slug?: string | null }).slug ?? person.id;
                  return (
                    <li key={person.id} className="border-b border-border-hairline">
                      <LocalizedLink
                        to={`/personalities/${slug}`}
                        className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2 text-inherit no-underline hover:underline"
                      >
                        <span className="font-bold">{person.name}</span>
                        <span className="text-13 text-muted-foreground">
                          {[years, person.nationality].filter(Boolean).join(' · ')}
                        </span>
                      </LocalizedLink>
                    </li>
                  );
                })}
              </ul>
            )
          ) : (
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-muted-foreground">
                  {people.length > 0
                    ? t('pages.professions.noMatches', 'No one matches these filters.')
                    : t('pages.professions.empty', 'No people for this profession yet.')}
                </p>
              </CardContent>
            </Card>
          )}
          {filtered.length > shown.length && (
            <div className="mt-6 flex justify-center">
              <Button
                type="button"
                variant="outline"
                onClick={() => setVisible((n) => n + PAGE_SIZE)}
              >
                {t('pages.professions.showMore', 'Show {{count}} more', {
                  count: Math.min(PAGE_SIZE, filtered.length - shown.length),
                })}
              </Button>
            </div>
          )}
        </section>

        {(birthplaceCount > 0 || youngest !== null) && (
          <section
            aria-labelledby="profession-overview"
            className="border-t border-border-hairline pt-4"
          >
            <h2 id="profession-overview" className="font-sans text-title font-bold">
              {t('pages.professions.aboutArchive', 'About this archive')}
            </h2>
            <dl className="mt-4 flex flex-wrap gap-8 text-13">
              {birthplaceCount > 0 && (
                <div>
                  <dt className="text-muted-foreground">
                    {t('pages.professions.birthplaces', 'Birthplaces recorded')}
                  </dt>
                  <dd className="mt-2 font-semibold tabular-nums">{birthplaceCount}</dd>
                </div>
              )}
              {youngest !== null && (
                <div>
                  <dt className="text-muted-foreground">
                    {t('pages.professions.ageRange', 'Age range')}
                  </dt>
                  <dd className="mt-2">
                    <span className="font-semibold tabular-nums">
                      {youngest === oldest ? youngest : `${youngest}–${oldest}`}
                    </span>
                    {includesDeceased && (
                      <span className="ml-2 text-muted-foreground">
                        {t('pages.professions.ageAtDeath', 'Age at death where known')}
                      </span>
                    )}
                  </dd>
                </div>
              )}
            </dl>
          </section>
        )}
      </div>
    </PageContainer>
  );
}
