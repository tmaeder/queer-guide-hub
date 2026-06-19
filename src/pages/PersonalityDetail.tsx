import { useParams } from 'react-router';
import { useTrackView } from '@/hooks/useTrackView';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useMeta } from '@/hooks/useMeta';
import { Button } from '@/components/ui/button';
import { SimilarItems } from '@/components/discovery/SimilarItems';
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

export default function PersonalityDetail() {
  useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const navigate = useLocalizedNavigate();
  const [countryId, setCountryId] = useState<string | null>(null);
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

  // Note: deliberately NOT storing nationality — it's sensitive personal data
  // and recently-viewed history lives in plaintext localStorage.
  useTrackView({
    type: 'personality',
    slug: personality?.slug,
    title: personality?.name,
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

  const metaTitle = useMemo(() => {
    if (!isLoading && !error && personality === null) return 'Personality not found';
    return personality?.name ?? undefined;
  }, [isLoading, error, personality]);

  useMeta({
    title: metaTitle,
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

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: personality?.name,
          text: personality?.description || `Learn about ${personality?.name}`,
          url: window.location.href,
        });
      } catch {
        // share dismissed
      }
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast({
        title: 'Link Copied',
        description: 'Profile link copied to clipboard',
      });
    }
  };

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

  const tabs = personality
    ? [
        {
          id: 'overview',
          label: 'Overview',
          content: (
            <PersonalityOverview personality={personality} onContentUpdated={refetch} />
          ),
        },
      ]
    : [];

  return (
    <>
      <EntityDetailLayout
        loading={isLoading}
        error={error as Error | null}
        breadcrumbs={[
          { label: 'Personalities', href: '/personalities' },
          ...(personality ? [{ label: personality.name }] : []),
        ]}
        hero={
          personality ? (
            <PersonalityHero
              personality={personality}
              countryId={countryId}
              onShare={handleShare}
              onProfessionClick={(profession) =>
                navigate(`/personalities?profession=${encodeURIComponent(profession)}`)
              }
              onContentUpdated={refetch}
            />
          ) : null
        }
        tabs={tabs}
        sidebar={
          personality ? (
            <PersonalitySidebar personality={personality} />
          ) : null
        }
        entityType="personality"
        entityId={personality?.id}
      />
      {personality && (
        <div className="mx-auto px-4">
          <SimilarItems
            entity={{ type: 'personality', id: personality.id }}
            contentTypes={['personality']}
            className="mt-8"
          />
          <MoreLikeThisByTag
            entityType="personality"
            entityId={personality.id}
            title="Related by tag"
            className="mt-8"
          />
        </div>
      )}
    </>
  );
}
