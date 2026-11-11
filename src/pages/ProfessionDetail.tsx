import { useState, useEffect } from 'react';
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

interface ProfessionData {
  name: string;
  personalities: Record<string, unknown>[];
  totalCount: number;
}

export default function ProfessionDetail() {
  const { t } = useTranslation();
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
    navigate('/tags');
  };

  useBreadcrumbs(
    professionData
      ? [{ label: t('breadcrumb.tags', 'Tags'), href: '/tags' }, { label: professionData.name }]
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
            <p className="text-destructive">{error || 'Profession not found'}</p>
            <Button variant="outline" onClick={handleBack} className="mt-4">
              <ArrowLeft size={16} className="mr-2" />
              Back to Resources
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
    .map((person) => calculateAge(person.birth_date as string | null, person.death_date as string | null))
    .filter((age): age is number => age !== null);
  const youngest = ages.length > 0 ? Math.min(...ages) : null;
  const oldest = ages.length > 0 ? Math.max(...ages) : null;
  const includesDeceased = professionData.personalities.some((person) => person.death_date);

  return (
    <PageContainer>
      <div className="flex flex-col gap-6">
        <header>
          <LocalizedLink to="/tags" className="text-13 font-medium underline underline-offset-4">
            {t('breadcrumb.tags', 'Resources')}
          </LocalizedLink>
          <h1 className="mt-2 break-words font-display text-headline leading-tight md:text-display">
            {professionData.name}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {professionData.totalCount} {professionData.totalCount === 1 ? 'person' : 'people'} in the Queer Guide archive
          </p>
        </header>

        <section aria-labelledby="profession-people">
          <h2 id="profession-people" className="sr-only">People in {professionData.name}</h2>
          {professionData.personalities.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {professionData.personalities.map((personality) => {
                const id = (personality as { id: string }).id;
                const asset = imageAssets.get(id);
                return (
                  <PersonalityCard
                    key={id}
                    personality={personality as never}
                    optimizedUrl={asset?.optimized_url}
                    thumbnailUrl={asset?.thumbnail_url}
                  />
                );
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-muted-foreground">No people for this profession yet.</p>
              </CardContent>
            </Card>
          )}
        </section>

        {(birthplaceCount > 0 || youngest !== null) && (
          <section aria-labelledby="profession-overview" className="border-t border-border-hairline pt-4">
            <h2 id="profession-overview" className="font-sans text-title font-bold">
              About this archive
            </h2>
            <dl className="mt-4 flex flex-wrap gap-8 text-13">
              {birthplaceCount > 0 && (
                <div>
                  <dt className="text-muted-foreground">Birthplaces recorded</dt>
                  <dd className="mt-2 font-semibold tabular-nums">{birthplaceCount}</dd>
                </div>
              )}
              {youngest !== null && (
                <div>
                  <dt className="text-muted-foreground">Age range</dt>
                  <dd className="mt-2">
                    <span className="font-semibold tabular-nums">
                      {youngest === oldest ? youngest : `${youngest}–${oldest}`}
                    </span>
                    {includesDeceased && (
                      <span className="ml-2 text-muted-foreground">Age at death where known</span>
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
