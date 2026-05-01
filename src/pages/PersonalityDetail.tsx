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
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
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

  useEffect(() => {
    if (isLoading || error) return;
    if (slug && personality === null) {
      toast({
        title: 'Not Found',
        description: 'Personality not found',
        variant: 'destructive',
      });
      navigate('/personalities');
    }
  }, [isLoading, error, personality, slug, navigate]);

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

  useEffect(() => {
    if (!personality?.nationality) return;
    let cancelled = false;
    (async () => {
      const { data: countryData } = await supabase
        .from('countries')
        .select('id')
        .eq('name', personality.nationality!)
        .maybeSingle();
      if (!cancelled && countryData) setCountryId(countryData.id);
    })();
    return () => {
      cancelled = true;
    };
  }, [personality?.nationality]);

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
      <Box sx={{ mx: 'auto', px: 2, py: 4, textAlign: 'center' }}>
        <Typography variant="h5" component="h1" sx={{ fontSize: '1.5rem', fontWeight: 700, mb: 2 }}>
          Personality Not Found
        </Typography>
        <Typography sx={{ color: 'text.secondary', mb: 3 }}>
          The personality you&apos;re looking for doesn&apos;t exist.
        </Typography>
        <Button onClick={() => navigate('/personalities')}>
          <ArrowLeft style={{ height: 16, width: 16, marginRight: 8 }} />
          Back to Personalities
        </Button>
      </Box>
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
        <Box sx={{ mx: 'auto', px: 2 }}>
          <SimilarItems entity={{ type: 'personality', id: personality.id }} className="mt-8" />
        </Box>
      )}
    </>
  );
}
