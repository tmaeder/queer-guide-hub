/**
 * CMSRoutePage — Renders CMS-managed pages at fixed routes.
 *
 * Used for pages like /about, /terms, /privacy that are now stored in
 * the cms_pages table rather than being hardcoded React components.
 *
 * Props:
 *   slug — The CMS page slug to fetch and render.
 *
 * Features:
 *   - Fetches published page by slug from cms_pages
 *   - DOMPurify-sanitized HTML rendering with styled typography
 *   - Hub hierarchy support (parent breadcrumb + child page listing)
 *   - Legal section: sidebar TOC via LegalPageLayout, custom hub layout
 *   - Loading skeleton + 404 fallback
 *   - SEO meta via useMeta hook
 */

import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, FileText, Shield, Cookie, Scale } from 'lucide-react';
import { useCMSPage } from '@/hooks/useCMSPage';
import DOMPurify from 'dompurify';
import { useMeta } from '@/hooks/useMeta';
import { LegalPageLayout } from '@/components/ui/LegalPageLayout';
import type { CMSPage } from '@/types/cms';
import type { LucideIcon } from 'lucide-react';

interface CMSRoutePageProps {
  slug: string;
}

// ── Legal hub icon mapping ──────────────────────────────────────────────────
const legalPageIcons: Record<string, LucideIcon> = {
  terms: FileText,
  privacy: Shield,
  cookies: Cookie,
  dmca: Scale,
};

// ── Heading extraction for TOC ──────────────────────────────────────────────
function extractSections(html: string): { sections: { id: string; title: string }[]; htmlWithIds: string } {
  const div = document.createElement('div');
  div.innerHTML = html;
  const sections: { id: string; title: string }[] = [];

  div.querySelectorAll('h2').forEach((h2) => {
    const text = h2.textContent?.trim() || '';
    if (!text) return;
    const id = h2.id || text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    h2.setAttribute('id', id);
    sections.push({ id, title: text });
  });

  return { sections, htmlWithIds: div.innerHTML };
}

// Body HTML styling — applied via a scoped CSS class (descendant selectors).
const HTML_BODY_CSS = `
.qg-cms-body h1 { font-size: 2rem; font-weight: 700; margin-top: 0; margin-bottom: 1rem; line-height: 1.2; }
.qg-cms-body h2 { font-size: 1.5rem; font-weight: 700; margin-top: 2rem; margin-bottom: 0.75rem; line-height: 1.25; }
.qg-cms-body h3 { font-size: 1.25rem; font-weight: 600; margin-top: 1.5rem; margin-bottom: 0.5rem; line-height: 1.3; }
.qg-cms-body p { font-size: 1rem; line-height: 1.8; margin-bottom: 1rem; }
.qg-cms-body ul, .qg-cms-body ol { padding-left: 1.5rem; margin-bottom: 1rem; }
.qg-cms-body li { margin-bottom: 0.375rem; line-height: 1.7; }
.qg-cms-body blockquote { border-left: 3px solid hsl(var(--border)); padding-left: 1rem; margin-left: 0; font-style: italic; color: hsl(var(--muted-foreground)); margin: 1rem 0; }
.qg-cms-body a { color: inherit; text-decoration: underline; }
.qg-cms-body a:hover { opacity: 0.85; }
.qg-cms-body img { max-width: 100%; height: auto; margin: 1rem 0; }
.qg-cms-body pre { background-color: #111; color: #f5f5f5; padding: 1rem; overflow: auto; margin: 1rem 0; font-size: 0.875rem; }
.qg-cms-body code { background-color: hsl(var(--accent)); padding: 0.125rem 0.375rem; font-size: 0.875em; }
.qg-cms-body table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
.qg-cms-body th, .qg-cms-body td { border: 1px solid hsl(var(--border)); padding: 0.5rem 0.75rem; text-align: left; }
.qg-cms-body th { background-color: hsl(var(--accent)); font-weight: 600; }
.qg-cms-body hr { border-color: hsl(var(--border)); margin: 1.5rem 0; }
.qg-cms-body strong { font-weight: 600; }
.qg-cms-body .legal-intro { font-size: 1.0625rem; color: hsl(var(--muted-foreground)); margin-bottom: 1.5rem; }
.qg-cms-body--legal h1 { display: none; }
`;

function CmsBodyStyles() {
  return <style dangerouslySetInnerHTML={{ __html: HTML_BODY_CSS }} />;
}

// ── Skeleton ────────────────────────────────────────────────────────────────
function PageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-screen-lg px-4 py-8 sm:px-6">
      <Skeleton className="mb-4 h-6 w-32" />
      <Skeleton className="mb-2 h-12 w-[70%]" />
      <Skeleton className="mb-8 h-7 w-1/2" />
      <Skeleton className="mb-4 h-[200px] w-full rounded-element" />
      <Skeleton className="mb-2 h-5 w-full" />
      <Skeleton className="mb-2 h-5 w-[90%]" />
      <Skeleton className="mb-2 h-5 w-[95%]" />
      <Skeleton className="h-5 w-[80%]" />
    </div>
  );
}

// ── Generic child page card (non-legal) ─────────────────────────────────────
function ChildPageCard({ page }: { page: CMSPage }) {
  return (
    <LocalizedLink
      to={`/${page.slug}`}
      className="flex items-start gap-4 bg-card p-5 text-foreground no-underline transition-opacity hover:opacity-85"
    >
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center bg-primary text-primary-foreground">
        <FileText size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="mb-0.5 text-base font-semibold">{page.title}</p>
        {page.subtitle && (
          <p className="text-sm leading-normal text-muted-foreground">{page.subtitle}</p>
        )}
      </div>
      <ChevronRight
        size={18}
        style={{ flexShrink: 0, marginTop: 2, color: 'hsl(var(--muted-foreground))' }}
      />
    </LocalizedLink>
  );
}

// ── Legal hub card ──────────────────────────────────────────────────────────
function LegalHubCard({ page }: { page: CMSPage }) {
  const Icon = legalPageIcons[page.slug] || FileText;

  return (
    <LocalizedLink
      to={`/${page.slug}`}
      className="group flex items-start gap-4 bg-card p-6 text-foreground no-underline transition-opacity hover:opacity-85"
    >
      <div className="mt-0.5 text-muted-foreground transition-colors group-hover:text-foreground">
        <Icon size={22} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="mb-0.5 text-base font-semibold">{page.title}</p>
        {page.subtitle && (
          <p className="text-sm leading-normal text-muted-foreground">{page.subtitle}</p>
        )}
      </div>
      <ChevronRight
        size={16}
        style={{ flexShrink: 0, marginTop: 4, color: 'hsl(var(--muted-foreground))' }}
      />
    </LocalizedLink>
  );
}

function Breadcrumb({ parent, current }: { parent: CMSPage; current: CMSPage }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
      <LocalizedLink
        to={`/${parent.slug}`}
        className="font-medium text-muted-foreground hover:underline"
      >
        {parent.title}
      </LocalizedLink>
      <ChevronRight size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
      <span className="font-semibold text-foreground">{current.title}</span>
    </nav>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
export default function CMSRoutePage({ slug }: CMSRoutePageProps) {
  const { data, isLoading: loading } = useCMSPage(slug);
  const page = data?.page ?? null;
  const parentPage = data?.parent ?? null;
  const childPages = data?.children ?? [];
  const notFound = !!data && data.notFound;

  const isLegalHub = slug === 'legal';
  const isLegalChild = page?.parent_slug === 'legal';
  const isLegalSection = isLegalHub || isLegalChild;

  useMeta({
    title: page?.meta_title || page?.title || '',
    description: page?.meta_description || page?.excerpt || '',
    canonicalPath: `/${slug}`,
  });

  if (loading) return <PageSkeleton />;

  if (notFound || !page) {
    return (
      <div className="mx-auto w-full max-w-screen-lg px-4 py-16 text-center sm:px-6">
        <h1 className="mb-2 text-3xl font-bold">Page Not Found</h1>
        <p className="text-muted-foreground">
          The page you're looking for doesn't exist or hasn't been published yet.
        </p>
      </div>
    );
  }

  // All CMS HTML is sanitized through DOMPurify before rendering
  const sanitizedHtml = page.body_html
    ? DOMPurify.sanitize(page.body_html, { ADD_ATTR: ['id'] })
    : '';

  // ── Legal hub layout ────────────────────────────────────────────────────
  if (isLegalHub) {
    return (
      <div className="mx-auto w-full max-w-[900px] px-4 py-8 sm:px-6 md:py-12">
        <h1 className="mb-1 text-3xl font-bold md:text-4xl">The Legal Stuff</h1>
        <p className="mb-8 max-w-[600px] text-base text-muted-foreground">
          Transparency matters. Here's everything about how we operate, protect your data, and keep this space safe.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {childPages.map((child) => (
            <LegalHubCard key={child.slug} page={child} />
          ))}
        </div>

        <p className="mt-10 text-sm text-muted-foreground">
          Questions? Reach out at{' '}
          <a
            href="mailto:legal@queer.guide"
            className="text-foreground underline hover:opacity-85"
          >
            legal@queer.guide
          </a>
        </p>
      </div>
    );
  }

  // ── Legal child pages (terms, privacy, cookies) ─────────────────────────
  if (isLegalChild && sanitizedHtml) {
    const { sections, htmlWithIds } = extractSections(sanitizedHtml);

    const formatDate = (d: string) => {
      try { return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }); }
      catch { return d; }
    };

    return (
      <>
        <CmsBodyStyles />
        {parentPage && (
          <div className="mx-auto w-full max-w-[1100px] px-4 pt-4 sm:px-6">
            <Breadcrumb parent={parentPage} current={page} />
          </div>
        )}
        <LegalPageLayout
          title={page.title}
          subtitle={page.subtitle || undefined}
          lastUpdated={page.updated_at ? formatDate(page.updated_at) : undefined}
          sections={sections}
        >
          <div
            className="qg-cms-body qg-cms-body--legal"
            dangerouslySetInnerHTML={{ __html: htmlWithIds }}
          />
        </LegalPageLayout>
      </>
    );
  }

  // ── Default CMS page layout ─────────────────────────────────────────────
  return (
    <div className="mx-auto w-full max-w-screen-lg px-4 py-8 sm:px-6">
      <CmsBodyStyles />
      {parentPage && (
        <div className="mb-4">
          <Breadcrumb parent={parentPage} current={page} />
        </div>
      )}

      {page.cover_image_url && (
        <img
          src={page.cover_image_url}
          alt={page.cover_image_alt || page.title}
          className="mb-6 max-h-[400px] w-full object-cover"
        />
      )}

      {sanitizedHtml && (
        <div className="qg-cms-body" dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
      )}

      {childPages.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-4 text-xl font-bold">Related Pages</h2>
          <div className="flex flex-col gap-3">
            {childPages.map((child) => (
              <ChildPageCard key={child.slug} page={child} />
            ))}
          </div>
        </div>
      )}

      {!isLegalSection && page.tags && page.tags.length > 0 && (
        <div className="mt-8 flex flex-wrap gap-2 border-t pt-4">
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
