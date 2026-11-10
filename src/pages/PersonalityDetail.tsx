import { useParams } from 'react-router';
import { KnowledgeReadingLinks, type KnowledgeReadingLink } from '@/components/knowledge/KnowledgeReadingLinks';
import { useCompetitionHistory } from '@/hooks/useCompetitions';
import { useMilestonesForEntity } from '@/hooks/useMilestones';
import { useTrackView } from '@/hooks/useTrackView';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from '@/components/icons';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useSlugRedirect } from '@/hooks/useSlugRedirect';
import { useDetailMeta } from '@/hooks/useDetailMeta';
import { Button } from '@/components/ui/button';
import { SimilarItems } from '@/components/discovery/SimilarItems';
import { MilestonesForEntity } from '@/components/discovery/MilestonesForEntity';
import { CompetitionsForEntity } from '@/components/discovery/CompetitionsForEntity';
import { MoreLikeThisByTag } from '@/components/tags/MoreLikeThisByTag';
import { EntityDetailLayout } from '@/components/entity/EntityDetailLayout';
import { usePersonalities, type Personality } from '@/hooks/usePersonalities';
import { toast } from '@/hooks/use-toast';
import { useCountryIdByName } from '@/hooks/usePageFetchers';
import { useTranslation } from 'react-i18next';
import {
  PersonalityHero,
  PersonalityOverview,
  PersonalitySidebar,
  fetchPersonalityBySlug,
} from './PersonalityDetail.parts';
import { PageContainer } from '@/components/layout/PageContainer';

export default function PersonalityDetail() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const navigate = useLocalizedNavigate();
  const [countryId, setCountryId] = useState<string | null>(null);
  const [similarKeys, setSimilarKeys] = useState<string[]>([]);
  const { incrementViews } = usePersonalities(false);

  const {
    data: personality,
    isLoading,
    error,
    refetch,
  } = useQuery<Personality | null>({
    queryKey: ['personality-detail', slug],
    enabled: Boolean(slug),
    staleTime: 60_000,
    queryFn: () => fetchPersonalityBySlug(slug!),
    retry: false,
  });

  const { data: milestones } = useMilestonesForEntity('personality', personality?.id);
  const { data: competitions } = useCompetitionHistory(personality?.id);

  // Merged-duplicate slug redirect (personality_slug_redirects); client-side
  // fallback for in-app navigation — the edge middleware handles the 301.
  const redirectPersonalitySlug = useSlugRedirect(
    {
      redirectTable: 'personality_slug_redirects',
      redirectIdColumn: 'personality_id',
      entityTable: 'personalities',
    },
    !isLoading && !personality ? (slug ?? null) : null,
  );
  useEffect(() => {
    if (redirectPersonalitySlug)
      navigate(`/personalities/${redirectPersonalitySlug}`, { replace: true });
  }, [redirectPersonalitySlug, navigate]);

  // Note: deliberately NOT storing nationality — it's sensitive personal data
  // and recently-viewed history lives in plaintext localStorage.
  useTrackView({
    type: 'personality',
    slug: personality?.slug,
    title: personality?.name,
    image: personality?.image_url,
  });

  useEffect(() => {
    if (!slug) {
      navigate('/personalities');
    }
  }, [slug, navigate]);

  useEffect(() => {
    if (error) {
      console.error('Error fetching personality:', error);
      toast({
        title: 'Error',
        description: 'Failed to load personality details',
        variant: 'destructive',
      });
      navigate('/personalities');
    }
  }, [error, navigate]);

  const metaDescription = useMemo(() => {
    if (!personality) return undefined;
    return (
      personality.description ||
      personality.bio?.substring(0, 160) ||
      `Learn about ${personality.name}, a notable LGBTQ+ personality.`
    );
  }, [personality]);

  useDetailMeta({
    status: isLoading ? 'loading' : error || personality === null ? 'notFound' : 'ready',
    notFoundTitle: 'Personality not found',
    title: personality?.name ?? undefined,
    description: metaDescription,
    canonicalPath: personality ? `/personalities/${personality.slug ?? personality.id}` : undefined,
    ogType: 'profile',
    ogImage: personality?.image_url ?? undefined,
  });

  // DUP-4: useCountryIdByName replaces the inline supabase.from('countries').
  const { data: resolvedCountryId } = useCountryIdByName(personality?.nationality ?? null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
    if (resolvedCountryId) setCountryId(resolvedCountryId);
  }, [resolvedCountryId]);

  useEffect(() => {
    if (personality?.id) {
      incrementViews(personality.id);
    }
  }, [personality?.id, incrementViews]);

  if (!isLoading && !error && !personality) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4 py-8">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold mb-4">Personality not found</h1>
          <p className="text-muted-foreground mb-6">
            The personality you&apos;re looking for was moved, removed, or never existed.
          </p>
          <Button onClick={() => navigate('/personalities')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Personalities
          </Button>
        </div>
      </div>
    );
  }

  const readingLinks: KnowledgeReadingLink[] = [];
  if (personality?.bio || personality?.description) {
    readingLinks.push({
      href: '#personality-biography',
      label: personality.bio
        ? t('knowledge.biography', 'Read the biography')
        : t('knowledge.personAbout', 'About this person'),
    });
  }
  if (milestones?.length) {
    readingLinks.push({ href: '#personality-history', label: t('milestones.forPerson', 'Milestones') });
  }
  if (competitions?.length) {
    readingLinks.push({
      href: '#personality-competitions',
      label: t('knowledge.competitionRecords', 'Competition records'),
    });
  }

  const tabs = personality
    ? [
        {
          id: 'overview',
          label: 'Overview',
          content: <PersonalityOverview personality={personality} onContentUpdated={refetch} />,
        },
      ]
    : [];

  return (
    <>
      <EntityDetailLayout
        loading={isLoading}
        error={error as Error | null}
        breadcrumbs={[
          { label: t('breadcrumb.personalities', 'People'), href: '/personalities' },
          ...(personality ? [{ label: personality.name }] : []),
        ]}
        hero={
          personality ? (
            <>
              <PersonalityHero
                personality={personality}
                countryId={countryId}
                onProfessionClick={(profession) =>
                  navigate(`/personalities?profession=${encodeURIComponent(profession)}`)
                }
                onContentUpdated={refetch}
              />
              {readingLinks.length > 0 && (
                <div className="mt-4"><KnowledgeReadingLinks links={readingLinks} /></div>
              )}
            </>
          ) : null
        }
        tabs={tabs}
        sidebar={personality ? <PersonalitySidebar personality={personality} /> : null}
        entityType="personality"
        entityId={personality?.id}
      />
      {personality && (
        <PageContainer flush>
          <div id="personality-history" className="scroll-mt-24">
            <MilestonesForEntity
              entityType="personality"
              entityId={personality.id}
              heading={t('milestones.forPerson', 'Milestones')}
            />
          </div>
          {/* Renders nothing unless this person actually competed, so it costs
              nothing on the ~15k personalities who did not. */}
          <div id="personality-competitions" className="scroll-mt-24">
            <CompetitionsForEntity
              personalityId={personality.id}
              heading={t('competitions.forPerson', 'Drag Race & pageants')}
            />
          </div>
          <SimilarItems
            entity={{ type: 'personality', id: personality.id }}
            contentTypes={['personality']}
            className="mt-8"
            onItemsChange={setSimilarKeys}
          />
          {/* Skips the people the rail above already shows: on Tchaikovsky
              both rails listed Cole Porter, Leonard Bernstein and Aaron Copland. */}
          <MoreLikeThisByTag
            entityType="personality"
            entityId={personality.id}
            title="Related by tag"
            className="mt-8"
            excludeKeys={similarKeys}
          />
        </PageContainer>
      )}
    </>
  );
}
