import { useParams } from 'react-router';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { Button } from '@/components/ui/button';
import { SimilarItems } from '@/components/discovery/SimilarItems';
import { EntityDetailLayout } from '@/components/entity/EntityDetailLayout';
import { usePersonalities, type Personality } from '@/hooks/usePersonalities';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useCountryIdByName } from '@/hooks/usePageFetchers';
import { useTranslation } from 'react-i18next';
import {
  type SimilarPersonality,
  PersonalityHero,
  PersonalityOverview,
  PersonalitySidebar,
  fetchPersonalityBySlug,
} from './PersonalityDetail.parts';

export default function PersonalityDetail() {
  useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const navigate = useLocalizedNavigate();
  const [similarPersonalities, setSimilarPersonalities] = useState<SimilarPersonality[]>([]);
  const [countryId, setCountryId] = useState<string | null>(null);
  const { incrementViews } = usePersonalities(false);

  const {
    data: personality,
    isLoading,
    error,
  } = useQuery<Personality | null>({
    queryKey: ['personality-detail', slug],
    enabled: Boolean(slug),
    staleTime: 60_000,
    queryFn: () => fetchPersonalityBySlug(slug!),
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

  // Render the in-app Not Found state instead of silently bouncing the user
  // back to /personalities — that hid the 404 and made the SPA disagree with
  // the edge-rendered HTTP 404 from functions/_middleware.ts.
  useEffect(() => {
    if (isLoading || error) return;
    if (slug && personality === null) {
      document.title = 'Personality not found · Queer Guide';
    }
  }, [isLoading, error, personality, slug]);

  useEffect(() => {
    if (!personality) return;
    document.title = `${personality.name} - Queer Guide`;
    const metaDescription =
      personality.description ||
      personality.bio?.substring(0, 160) ||
      `Learn about ${personality.name}, a notable LGBTQ+ personality.`;
    const existingMeta = document.querySelector('meta[name="description"]');
    if (existingMeta) {
      existingMeta.setAttribute('content', metaDescription);
    } else {
      const meta = document.createElement('meta');
      meta.name = 'description';
      meta.content = metaDescription;
      document.head.appendChild(meta);
    }
  }, [personality]);

  // DUP-4: useCountryIdByName replaces the inline supabase.from('countries').
  const { data: resolvedCountryId } = useCountryIdByName(personality?.nationality ?? null);
  useEffect(() => {
    if (resolvedCountryId) setCountryId(resolvedCountryId);
  }, [resolvedCountryId]);

  useEffect(() => {
    if (!personality?.id) return;
    let cancelled = false;
    (async () => {
      const { data: similarData } = await supabase.rpc('get_similar_personalities', {
        personality_uuid: personality.id,
        result_limit: 6,
        min_similarity: 0.3,
      });
      if (!cancelled && similarData) setSimilarPersonalities(similarData as SimilarPersonality[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [personality?.id]);

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
            <PersonalityOverview
              personality={personality}
              similarPersonalities={similarPersonalities}
            />
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
            />
          ) : null
        }
        tabs={tabs}
        sidebar={
          personality ? (
            <PersonalitySidebar
              personality={personality}
              countryId={countryId}
              onTagClick={(tag) => navigate(`/resources/${encodeURIComponent(tag)}`)}
            />
          ) : null
        }
        entityType="personality"
        entityId={personality?.id}
      />
      {personality && (
        <div className="mx-auto px-4">
          <SimilarItems entity={{ type: 'personality', id: personality.id }} className="mt-8" />
        </div>
      )}
    </>
  );
}
