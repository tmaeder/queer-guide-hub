/**
 * Public page renderer for cms_pages.
 * Route: /p/:slug
 * Fetches published page by slug and renders HTML body.
 */

import { useParams } from 'react-router';
import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import DOMPurify from 'dompurify';
import { useCMSPage } from '@/hooks/useCMSPage';

export default function Page() {
  const { slug } = useParams<{ slug: string }>();
  const { data, isLoading: loading } = useCMSPage(slug);
  const page = data?.page ?? null;
  const notFound = !!data && data.notFound;

  if (loading) {
    return (
      <div className="container mx-auto py-16 text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto" aria-label="Loading" />
      </div>
    );
  }

  if (notFound || !page) {
    return (
      <div className="container mx-auto py-16 text-center">
        <h4 className="text-2xl font-bold mb-2">Page Not Found</h4>
        <p className="text-muted-foreground">
          The page you're looking for doesn't exist or hasn't been published yet.
        </p>
      </div>
    );
  }

  const sanitizedHtml = page.body_html ? DOMPurify.sanitize(page.body_html) : '';

  return (
    <div className="container mx-auto py-8 px-4">
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
        <h1 className="text-4xl font-extrabold leading-tight mb-2">{page.title}</h1>
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
        <div className="mt-8 pt-4 border-t flex flex-wrap gap-1">
          {page.tags.map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
