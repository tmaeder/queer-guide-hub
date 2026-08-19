/**
 * CMSRoutePage — Renders CMS-managed pages at fixed routes.
 *
 * Used for pages like /about, /terms, /privacy that are stored in the
 * cms_pages table rather than being hardcoded React components.
 *
 * Props:
 *   slug — The CMS page slug to fetch and render.
 *
 * Three layouts:
 *   - Legal hub (/legal)        → a route index of the policy lines
 *   - Policy page + /accessibility → LegalPageLayout (the line + stations)
 *   - Everything else           → the default CMS page
 */

import { useMemo } from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useBreadcrumbs } from '@/contexts/BreadcrumbContext';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useCMSPage } from '@/hooks/useCMSPage';
import DOMPurify from 'dompurify';
import { useMeta } from '@/hooks/useMeta';
import { LegalPageLayout } from '@/components/ui/LegalPageLayout';
import { AccessibilityControls } from '@/components/accessibility/AccessibilityControls';
import { RouteBullet } from '@/components/transit/RouteBullet';
import { LEGAL_LINE_ORDER, POLICY_LINES } from '@/components/transit/policyLines';
import { extractSections } from '@/lib/htmlSections';
import type { CMSPage } from '@/types/cms';
import { PageContainer } from '@/components/layout/PageContainer';

interface CMSRoutePageProps {
  slug: string;
}

/** Position on the hub. Unknown slugs sort last rather than to the front. */
function legalOrder(slug: string): number {
  const i = (LEGAL_LINE_ORDER as readonly string[]).indexOf(slug);
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
}

/** Count the stations on a policy without parsing it — used by the hub to say
 *  how long each document is before you open it. */
function countStations(html: string | null | undefined): number {
  if (!html) return 0;
  return (html.match(/<h2\b/gi) ?? []).length;
}

// ── Skeleton ────────────────────────────────────────────────────────────────
function PageSkeleton() {
  return (
    <PageContainer className="w-full">
      <Skeleton className="mb-4 h-6 w-32" />
      <Skeleton className="mb-2 h-12 w-[70%]" />
      <Skeleton className="mb-8 h-7 w-1/2" />
      <Skeleton className="mb-4 h-[200px] w-full" />
      <Skeleton className="mb-2 h-5 w-full" />
      <Skeleton className="mb-2 h-5 w-[90%]" />
      <Skeleton className="mb-2 h-5 w-[95%]" />
      <Skeleton className="h-5 w-[80%]" />
    </PageContainer>
  );
}

// ── One index card, used by both the legal hub and generic hubs ─────────────
function PageIndexCard({ page }: { page: CMSPage }) {
  const line = POLICY_LINES[page.slug];
  const stations = countStations(page.body_html);

  return (
    <LocalizedLink
      to={`/${page.slug}`}
      className="card-lift group flex items-start gap-4 bg-card p-6 text-inherit no-underline rounded-container shadow-soft"
    >
      <RouteBullet
        type={line?.slug ?? 'page'}
        letter={line?.letter}
        track={line?.track}
        label={line ? `${line.label} line` : undefined}
        size={38}
      />
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-headline leading-tight">{page.title}</h2>
        {page.subtitle && (
          <p className="mt-1 text-13 leading-relaxed text-muted-foreground">{page.subtitle}</p>
        )}
        {stations > 0 && (
          <p className="mt-4 text-2xs font-bold uppercase tracking-label text-muted-foreground">
            <span className="tabular-nums">{stations}</span> sections
          </p>
        )}
      </div>
    </LocalizedLink>
  );
}

/** Deep links into the sections people actually arrive looking for. Only
 *  possible now that every heading carries a stable id. */
// Ids here must match what extractSections produces: a DB-authored `id` when
// the heading has one (terms and privacy do), otherwise the slugified heading
// text with any typed-in number already stripped (cookies and dmca).
const COMMON_REQUESTS: { label: string; to: string }[] = [
  { label: 'Get a copy of my data, or delete it', to: '/privacy#your-rights' },
  { label: 'Change what cookies I allow', to: '/cookies#managing-cookies' },
  { label: 'Report copyright infringement', to: '/dmca#reporting-infringing-content' },
  { label: 'What happens to a suspended account', to: '/terms#account-termination' },
];

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
  // /accessibility is not a child of /legal — it is its own hub — but it is a
  // long structured policy-shaped document and reads far better on the line
  // layout than as an undifferentiated wall of prose.
  const isLineLayout = isLegalChild || slug === 'accessibility';

  useMeta({
    title: page?.meta_title || page?.title || '',
    description: page?.meta_description || page?.excerpt || '',
    canonicalPath: `/${slug}`,
  });

  useBreadcrumbs(
    page
      ? [
          ...(parentPage ? [{ label: parentPage.title, href: `/${parentPage.slug}` }] : []),
          { label: page.title },
        ]
      : null,
  );

  // All CMS HTML is sanitized through DOMPurify before rendering.
  const sanitizedHtml = useMemo(
    () => (page?.body_html ? DOMPurify.sanitize(page.body_html, { ADD_ATTR: ['id'] }) : ''),
    [page],
  );

  // Parses the document with the DOM, so it must not run in the render body.
  const parsed = useMemo(
    () => (isLineLayout && sanitizedHtml ? extractSections(sanitizedHtml) : null),
    [isLineLayout, sanitizedHtml],
  );

  if (loading) return <PageSkeleton />;

  if (notFound || !page) {
    return (
      <PageContainer className="w-full text-center">
        <h1 className="mb-2 font-display text-display">Page Not Found</h1>
        <p className="text-muted-foreground">
          The page you're looking for doesn't exist or hasn't been published yet.
        </p>
      </PageContainer>
    );
  }

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return d;
    }
  };

  // ── Legal hub: the route index ──────────────────────────────────────────
  if (isLegalHub) {
    return (
      <PageContainer className="max-w-[1100px]">
        <header className="border-b border-border-hairline pb-6">
          <p className="text-2xs font-bold uppercase tracking-label text-muted-foreground">Legal</p>
          <h1 className="mt-4 font-display text-display leading-none tracking-tight md:text-hero">
            {page.title}
          </h1>
          {page.subtitle && (
            <p className="mt-4 max-w-2xl text-body-lg text-muted-foreground">{page.subtitle}</p>
          )}
        </header>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Line order, not alphabetical. The hook sorts by title, which put
              Cookies and Copyright ahead of Terms — the document you accept
              first should be the one you meet first. */}
          {[...childPages]
            .sort((a, b) => legalOrder(a.slug) - legalOrder(b.slug))
            .map((child) => (
              <PageIndexCard key={child.slug} page={child} />
            ))}
        </div>

        <section className="mt-12 bg-muted rounded-container p-6" aria-labelledby="common">
          <p className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
            Straight there
          </p>
          <h2 id="common" className="mt-1 font-display text-headline leading-tight">
            Common requests
          </h2>
          <ul className="mt-4 flex flex-col">
            {COMMON_REQUESTS.map((r) => (
              <li key={r.to} className="border-b border-border-hairline last:border-b-0">
                <LocalizedLink
                  to={r.to}
                  className="block py-2 text-13 font-bold text-inherit no-underline transition-colors hover:bg-surface-container"
                >
                  {r.label}
                </LocalizedLink>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-8 bg-foreground p-6 text-background">
          <p className="text-2xs font-bold uppercase tracking-label text-background/70">
            End of line
          </p>
          <p className="mt-2 text-13 leading-relaxed text-background/80">
            Questions? We're real humans at{' '}
            <a href="mailto:legal@queer.guide" className="font-bold text-background">
              legal@queer.guide
            </a>
            .
          </p>
        </section>
      </PageContainer>
    );
  }

  // ── Policy pages + /accessibility: the line layout ───────────────────────
  if (isLineLayout && parsed) {
    return (
      <>
        <LegalPageLayout
          title={page.title}
          subtitle={page.subtitle || undefined}
          lastUpdated={page.updated_at ? formatDate(page.updated_at) : undefined}
          sections={parsed.sections}
          slug={slug}
          eyebrow={slug === 'accessibility' ? 'Accessibility' : 'Legal'}
          footer={
            slug === 'accessibility' ? (
              <section
                className="mt-12 bg-muted rounded-container p-6"
                aria-labelledby="a11y-settings"
              >
                <p className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
                  Live controls
                </p>
                <h2 id="a11y-settings" className="mt-1 font-display text-headline leading-tight">
                  Your accessibility settings
                </h2>
                <p className="mb-6 mt-2 text-13 leading-relaxed text-muted-foreground">
                  These apply instantly and are saved to this device.
                </p>
                <AccessibilityControls />
              </section>
            ) : null
          }
        >
          <div
            className="qg-cms-body qg-cms-body--legal"
            dangerouslySetInnerHTML={{ __html: parsed.htmlWithIds }}
          />
        </LegalPageLayout>
      </>
    );
  }

  // ── Default CMS page layout ─────────────────────────────────────────────
  return (
    <PageContainer className="w-full">
      {page.cover_image_url && (
        <img
          src={page.cover_image_url}
          alt={page.cover_image_alt || page.title}
          className="mb-6 max-h-[400px] w-full bg-muted rounded-element object-cover"
        />
      )}

      {sanitizedHtml && (
        <div className="qg-cms-body" dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
      )}

      {childPages.length > 0 && (
        <div className="mt-12">
          <h2 className="mb-4 font-display text-headline leading-tight">Related pages</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {childPages.map((child) => (
              <PageIndexCard key={child.slug} page={child} />
            ))}
          </div>
        </div>
      )}

      {!isLegalSection && page.tags && page.tags.length > 0 && (
        <div className="mt-8 flex flex-wrap gap-2 pt-4">
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
