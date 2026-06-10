import { useMeta } from '@/hooks/useMeta';
import { useVenueGuidesIndex } from '@/hooks/useVenueGuide';
import { VenueGuideCard } from '@/components/venues/VenueGuideCard';
import { PageHero } from '@/components/discovery';
import { EmptyState } from '@/components/ui/EmptyState';
import { BookOpen } from 'lucide-react';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';

const VenueGuides = () => {
  const navigate = useLocalizedNavigate();
  const { data: guides = [], isLoading } = useVenueGuidesIndex();

  useMeta({
    title: 'Venue Guides',
    description:
      'Editor-written guides to LGBTQ+ venues — comparison-driven, city-first, no fluff.',
    canonicalPath: '/venues/guides',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Venue Guides',
      url: 'https://queer.guide/venues/guides',
      isPartOf: { '@type': 'WebSite', name: 'Queer Guide', url: 'https://queer.guide' },
    },
  });

  return (
    <div className="min-h-screen">
      <PageHero
        eyebrow="Editorial"
        title="Venue Guides."
        lede="Hand-picked itineraries for first visits and locals."
        size="md"
      />
      <div className="container mx-auto py-8 md:py-12 px-4">
        {isLoading ? (
          <div className="grid grid-cols-12 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="col-span-12 md:col-span-6 lg:col-span-4 rounded-container border border-border bg-card overflow-hidden"
              >
                <div className="aspect-[16/9] bg-muted animate-pulse" />
                <div className="p-6 space-y-3">
                  <div className="h-3 w-24 bg-muted animate-pulse rounded-badge" />
                  <div className="h-6 w-3/4 bg-muted animate-pulse rounded-element" />
                  <div className="h-4 w-2/3 bg-muted animate-pulse rounded-element" />
                </div>
              </div>
            ))}
          </div>
        ) : guides.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No guides yet."
            description="New venue guides land regularly. Check back soon."
            primaryAction={{
              label: 'Back to venues',
              onClick: () => navigate('/venues'),
            }}
          />
        ) : (
          <div className="grid grid-cols-12 gap-6">
            {guides.map((g, i) => (
              <div key={g.id} className="col-span-12 md:col-span-6 lg:col-span-4">
                <VenueGuideCard
                  guide={{
                    id: g.id,
                    slug: g.slug,
                    title: g.title,
                    dek: g.dek,
                    hero_image_path: g.hero_image_path,
                    category: g.category,
                    city_id: g.city_id,
                    audience_tags: g.audience_tags,
                    reading_time_min: g.reading_time_min,
                    pick_count: g.pick_count,
                    published_at: g.published_at,
                    boost_reason: g.is_featured ? 'featured' : null,
                  }}
                  priority={i < 3}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default VenueGuides;
