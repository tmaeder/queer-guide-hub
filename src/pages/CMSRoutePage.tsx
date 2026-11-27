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
import { ArrowRight } from '@/components/icons';
import { LinkToUs } from '@/components/press/LinkToUs';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useBreadcrumbs } from '@/contexts/BreadcrumbContext';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { useCMSPage } from '@/hooks/useCMSPage';
import { sanitizeArticle } from '@/lib/sanitize';
import { useDetailMeta } from '@/hooks/useDetailMeta';
import { LegalPageLayout } from '@/components/ui/LegalPageLayout';
import { AccessibilityControls } from '@/components/accessibility/AccessibilityControls';
import { RouteBullet } from '@/components/transit/RouteBullet';
import { LEGAL_LINE_ORDER, POLICY_LINES } from '@/components/transit/policyLines';
import { extractSections } from '@/lib/htmlSections';
import type { CMSPage } from '@/types/cms';
import { PageContainer } from '@/components/layout/PageContainer';
import { CmsArticle, CmsPageUnavailable } from '@/components/cms/CmsArticle';
import { formatCmsDate } from '@/lib/cms/formatCmsDate';
import { normalizeCmsBody } from '@/lib/cms/normalizeCmsBody';
import { OPEN_COOKIE_PREFERENCES_EVENT } from '@/lib/analyticsConsent';

interface CMSRoutePageProps {
  slug: string;
}

/** Position on the hub. Unknown slugs sort last rather than to the front. */
function legalOrder(slug: string): number {
  const i = (LEGAL_LINE_ORDER as readonly string[]).indexOf(slug);
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
}

// ── Skeleton ────────────────────────────────────────────────────────────────
function PageSkeleton() {
  return (
    <PageContainer>
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
function PageIndexCard({ page }: { page: Pick<CMSPage, 'slug' | 'title' | 'subtitle'> }) {
  const line = POLICY_LINES[page.slug];

  return (
    <LocalizedLink
      to={`/${page.slug}`}
      className="card-lift group flex items-start gap-4 bg-card p-6 text-inherit no-underline rounded-container shadow-soft"
    >
      <RouteBullet
        type={line?.slug ?? 'page'}
        icon={line?.icon}
        track={line?.track}
        label={line ? `${line.label} line` : undefined}
        size={38}
      />
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-headline leading-tight">{page.title}</h2>
        {page.subtitle && (
          <p className="mt-1 text-13 leading-relaxed text-muted-foreground">{page.subtitle}</p>
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
  const { t } = useTranslation();
  const { data, isLoading: loading, isError, refetch } = useCMSPage(slug);
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

  useDetailMeta({
    status: loading ? 'loading' : notFound || !page ? 'notFound' : 'ready',
    notFoundTitle: 'Page Not Found',
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
    () => (page?.body_html ? sanitizeArticle(page.body_html) : ''),
    [page],
  );

  // Parses the document with the DOM, so it must not run in the render body.
  const parsed = useMemo(
    () =>
      isLineLayout && sanitizedHtml
        ? extractSections(normalizeCmsBody(sanitizedHtml, { subtitle: page?.subtitle }))
        : null,
    [isLineLayout, sanitizedHtml, page?.subtitle],
  );

  if (loading) return <PageSkeleton />;

  if (isError && !page) return <CmsPageUnavailable failed onRetry={() => void refetch()} />;
  if (notFound || !page) return <CmsPageUnavailable />;

  // ── Legal hub: the route index ──────────────────────────────────────────
  if (isLegalHub) {
    return (
      <PageContainer>
        <header className="border-b border-border-hairline pb-6">
          <h1 className="font-display text-display leading-none tracking-tight md:text-hero">
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
          {/* Accessibility is its own CMS page (not a child of `legal`, since it
              is not a contract), but people look for the statement here. */}
          {!childPages.some((c) => c.slug === 'accessibility') && (
            <PageIndexCard
              page={{
                slug: 'accessibility',
                title: 'Accessibility',
                subtitle:
                  'How the site works with assistive technology, and how to tell us when it doesn’t',
              }}
            />
          )}
        </div>

        <section
          className="mt-12 rounded-panel bg-card p-6 shadow-soft md:p-8"
          aria-labelledby="common"
        >
          <p className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
            Straight there
          </p>
          <h2 id="common" className="mt-1 font-display text-headline leading-tight">
            Common requests
          </h2>
          <ul className="mt-6 grid grid-cols-1 gap-2 md:grid-cols-2">
            {COMMON_REQUESTS.map((r) => (
              <li key={r.to}>
                <LocalizedLink
                  to={r.to}
                  className="group flex min-h-14 items-center justify-between gap-4 rounded-element bg-muted px-4 py-2 text-15 font-bold text-inherit no-underline transition-colors hover:bg-foreground hover:text-background"
                >
                  {r.label}
                  <ArrowRight
                    size={16}
                    aria-hidden
                    className="shrink-0 transition-transform group-hover:translate-x-0.5 rtl:rotate-180"
                  />
                </LocalizedLink>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-8 overflow-hidden rounded-container bg-foreground p-6 text-background">
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
          lastUpdated={formatCmsDate(page.updated_at) ?? undefined}
          summary={slug === 'privacy' ? <ManageYourPrivacy /> : null}
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
    <CmsArticle
      title={page.title}
      subtitle={page.subtitle}
      html={sanitizedHtml}
      dateLabel={t('cms.updated', 'Updated')}
      date={page.updated_at}
      cover={
        page.cover_image_url
          ? { url: page.cover_image_url, alt: page.cover_image_alt || page.title }
          : null
      }
    >
      {/* Coded, not CMS: the snippets must name routes that exist, which a
          test checks against the route manifest. */}
      {slug === 'press' && <LinkToUs />}

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
    </CmsArticle>
  );
}

/** Direct routes to the controls a privacy reader usually came for. Every
 *  target exists: the two settings sections (sign-in required, the settings
 *  page handles that) and the cookie dialog the footer also opens. */
function ManageYourPrivacy() {
  const { t } = useTranslation();
  const linkClass =
    'flex min-h-11 items-center justify-between gap-2 rounded-element bg-background px-4 py-2 text-13 font-bold text-inherit no-underline hover:bg-foreground hover:text-background';
  return (
    <section className="mb-8 rounded-container bg-muted p-6" aria-labelledby="manage-privacy">
      <h2 id="manage-privacy" className="font-display text-headline leading-tight">
        {t('privacyPolicy.manageTitle', 'Manage your privacy')}
      </h2>
      <p className="mt-2 text-13 text-muted-foreground">
        {t(
          'privacyPolicy.manageBody',
          'Change these yourself. Account settings need you to be signed in.',
        )}
      </p>
      <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <li>
          <LocalizedLink to="/settings/privacy" className={linkClass}>
            {t('privacyPolicy.manageVisibility', 'Privacy and visibility settings')}
            <ArrowRight size={16} aria-hidden className="shrink-0 rtl:rotate-180" />
          </LocalizedLink>
        </li>
        <li>
          <LocalizedLink to="/settings/data" className={linkClass}>
            {t('privacyPolicy.manageData', 'Download or delete your data')}
            <ArrowRight size={16} aria-hidden className="shrink-0 rtl:rotate-180" />
          </LocalizedLink>
        </li>
        <li>
          <Button
            type="button"
            variant="ghost"
            className={`${linkClass} w-full`}
            onClick={() => window.dispatchEvent(new CustomEvent(OPEN_COOKIE_PREFERENCES_EVENT))}
          >
            {t('privacyPolicy.manageCookies', 'Cookie preferences')}
          </Button>
        </li>
        <li>
          <a href="mailto:legal@queer.guide" className={linkClass}>
            {t('privacyPolicy.manageRequest', 'Email a privacy request')}
          </a>
        </li>
      </ul>
    </section>
  );
}
