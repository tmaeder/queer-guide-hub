/**
 * Public page renderer for cms_pages.
 * Route: /p/:slug
 * Fetches published page by slug and renders HTML body.
 *
 * SEO: every cms_pages row carries authored `meta_title`/`meta_description`,
 * which this renderer previously dropped on the floor — /p/* inherited whatever
 * <title> the previous SPA route left behind. Meta is emitted via the same
 * useMeta call CMSRoutePage uses, with an explicit canonicalPath so the
 * locale-prefixed form (/de/p/about) canonicalises to the unprefixed URL
 * instead of minting a separate one per locale.
 */

import { useParams } from 'react-router';
import { TrackLoader } from '@/components/transit/TrackLoader';

import { Badge } from '@/components/ui/badge';
import DOMPurify from 'dompurify';
import { useCMSPage } from '@/hooks/useCMSPage';
import { useMeta } from '@/hooks/useMeta';
import { PageContainer } from '@/components/layout/PageContainer';

export default function Page() {
  const { slug } = useParams<{ slug: string }>();
  const { data, isLoading: loading } = useCMSPage(slug);
  const page = data?.page ?? null;
  const notFound = !!data && data.notFound;

  useMeta({
    title: page?.meta_title || page?.title || '',
    description: page?.meta_description || page?.excerpt || '',
    ogImage: page?.og_image_url || page?.cover_image_url,
    canonicalPath: slug ? `/p/${slug}` : undefined,
  });

  if (loading) {
    return (
      <PageContainer className="text-center">
        <TrackLoader size={32} label="Loading" className="mx-auto" />
      </PageContainer>
    );
  }

  if (notFound || !page) {
    return (
      <PageContainer className="text-center">
        <h4 className="text-2xl font-bold mb-2">Page Not Found</h4>
        <p className="text-muted-foreground">
          The page you're looking for doesn't exist or hasn't been published yet.
        </p>
      </PageContainer>
    );
  }

  const sanitizedHtml = page.body_html ? DOMPurify.sanitize(page.body_html) : '';

  return (
    <PageContainer>
      {/* Cover image */}
      {page.cover_image_url && (
        <img
          src={page.cover_image_url}
          alt={page.cover_image_alt || page.title}
          className="w-full max-h-[400px] object-cover rounded-element mb-6"
        />
      )}

      {/* Header */}
      <div className="mb-8">
        {page.category && (
          <Badge variant="secondary" className="mb-2">
            {page.category}
          </Badge>
        )}
        <h1 className="text-4xl font-bold leading-tight mb-2">{page.title}</h1>
        {page.subtitle && (
          <h6 className="text-xl text-muted-foreground font-normal mb-2">{page.subtitle}</h6>
        )}
        {page.published_at && (
          <p className="text-xs text-muted-foreground">
            Published{' '}
            {new Date(page.published_at).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        )}
      </div>

      {/* Body */}
      {sanitizedHtml && (
        <div
          dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
          className="prose prose-neutral dark:prose-invert max-w-none"
        />
      )}

      {/* Tags */}
      {page.tags && page.tags.length > 0 && (
        <div className="mt-8 pt-4 flex flex-wrap gap-1">
          {page.tags.map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
            </Badge>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
