import { useMeta } from '@/hooks/useMeta';
import { useMarketplaceGuidesIndex } from '@/hooks/useMarketplaceGuide';
import { GuideCard } from '@/components/marketplace/GuideCard';
import { PageHero } from '@/components/discovery';
import { EmptyState } from '@/components/ui/EmptyState';
import { BookOpen } from 'lucide-react';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';

const MarketplaceGuides = () => {
  const navigate = useLocalizedNavigate();
  const { data: guides = [], isLoading } = useMarketplaceGuidesIndex();

  useMeta({
    title: 'Marketplace Guides',
    description:
      'Editorial buying guides for LGBTQ+ products and services — comparison-driven, queer-owned-first, no fluff.',
    canonicalPath: '/marketplace/guides',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Marketplace Guides',
      url: 'https://queer.guide/marketplace/guides',
      isPartOf: { '@type': 'WebSite', name: 'Queer Guide', url: 'https://queer.guide' },
    },
  });

  return (
    <div className="min-h-screen">
      <PageHero
        eyebrow="Editorial"
        title="Marketplace Guides."
        lede="Comparison-driven buying guides for LGBTQ+ products and services."
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
                <div className="p-6 space-y-2">
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
            description="New guides land regularly. Check back soon."
            primaryAction={{
              label: 'Back to marketplace',
              onClick: () => navigate('/marketplace'),
            }}
          />
        ) : (
          <div className="grid grid-cols-12 gap-6">
            {guides.map((g, i) => (
              <div key={g.id} className="col-span-12 md:col-span-6 lg:col-span-4">
                <GuideCard
                  guide={{
                    id: g.id,
                    slug: g.slug,
                    title: g.title,
                    dek: g.dek,
                    hero_image_path: g.hero_image_path,
                    category_slug: g.category_slug,
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

export default MarketplaceGuides;
