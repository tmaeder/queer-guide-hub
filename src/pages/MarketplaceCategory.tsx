import { useParams } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { useMeta } from '@/hooks/useMeta';
import { PageHeader } from '@/components/layout/PageHeader';
import { MarketplaceFilteredView } from '@/components/marketplace/MarketplaceFilteredView';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';

function prettify(slug: string): string {
  return slug.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function MarketplaceCategory() {
  const { slug } = useParams<{ slug: string }>();
  const subcategory = (slug ?? '').toLowerCase();
  const name = prettify(subcategory);

  useMeta({
    title: name ? `${name} — Marketplace` : 'Marketplace category',
    description: `Browse ${name || 'this category'} on Queer Guide.`,
    canonicalPath: subcategory ? `/marketplace/category/${subcategory}` : undefined,
  });

  if (!subcategory) {
    return (
      <div className="container mx-auto py-12 px-4 text-center">
        <h1 className="text-2xl font-bold mb-3">Category not found</h1>
        <LocalizedLink to="/marketplace">
          <Button>
            <ArrowLeft style={{ width: 16, height: 16, marginRight: 8 }} />
            Back to Marketplace
          </Button>
        </LocalizedLink>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="container mx-auto py-12 md:py-20 px-4">
        <div className="mb-4">
          <LocalizedLink to="/marketplace">
            <Button variant="ghost" size="sm">
              <ArrowLeft style={{ width: 14, height: 14, marginRight: 6 }} />
              All marketplace
            </Button>
          </LocalizedLink>
        </div>
        <PageHeader title={name} subtitle="Queer-friendly products and services in this category." />
        <MarketplaceFilteredView
          filters={{ subcategory }}
          emptyTitle={`No ${name.toLowerCase()} listings yet.`}
          emptyDescription="Check back soon or list a business."
        />
      </div>
    </div>
  );
}
