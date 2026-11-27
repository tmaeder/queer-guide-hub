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
import { useTranslation } from 'react-i18next';
import { TrackLoader } from '@/components/transit/TrackLoader';

import { Badge } from '@/components/ui/badge';
import { sanitizeArticle } from '@/lib/sanitize';
import { useCMSPage } from '@/hooks/useCMSPage';
import { useDetailMeta } from '@/hooks/useDetailMeta';
import { PageContainer } from '@/components/layout/PageContainer';
import { CmsArticle, CmsPageUnavailable } from '@/components/cms/CmsArticle';

export default function Page() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const { data, isLoading: loading, isError, refetch } = useCMSPage(slug);
  const page = data?.page ?? null;
  const notFound = !!data && data.notFound;

  useDetailMeta({
    status: loading ? 'loading' : notFound || !page ? 'notFound' : 'ready',
    notFoundTitle: 'Page Not Found',
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

  if (isError && !page) return <CmsPageUnavailable failed onRetry={() => void refetch()} />;
  if (notFound || !page) return <CmsPageUnavailable />;

  // Sanitised first (DOMPurify, ids kept so authored anchors still work);
  // CmsArticle then fixes the heading outline.
  const sanitizedHtml = page.body_html ? sanitizeArticle(page.body_html) : '';

  return (
    <CmsArticle
      title={page.title}
      subtitle={page.subtitle}
      html={sanitizedHtml}
      eyebrow={page.category}
      dateLabel={t('cms.published', 'Published')}
      date={page.published_at}
      cover={
        page.cover_image_url
          ? { url: page.cover_image_url, alt: page.cover_image_alt || page.title }
          : null
      }
    >
      {page.tags && page.tags.length > 0 && (
        <div className="mt-8 flex flex-wrap gap-1 pt-4">
          {page.tags.map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
            </Badge>
          ))}
        </div>
      )}
    </CmsArticle>
  );
}
