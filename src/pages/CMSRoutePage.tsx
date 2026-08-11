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
import type { RouteStation } from '@/components/transit/RouteStrip';
import type { CMSPage } from '@/types/cms';
import { PageContainer } from '@/components/layout/PageContainer';

interface CMSRoutePageProps {
  slug: string;
}

/** Headings in the corpus carry hand-typed section numbers ("1. Overview").
 *  The layout numbers stations itself, from a CSS counter, so the typed prefix
 *  is stripped here as well as in the DB — that way the frontend is correct
 *  whether or not the normalisation migration has run, and stays correct if an
 *  editor types "1." into the CMS again. */
const TYPED_NUMBER = /^\s*\d{1,2}\.\s+/;

function stripTypedNumber(el: HTMLElement): string {
  const text = el.textContent?.trim() ?? '';
  if (!TYPED_NUMBER.test(text)) return text;
  // Rewrite the first text node only, so inline markup inside the heading
  // survives.
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const first = walker.nextNode();
  if (first?.nodeValue) first.nodeValue = first.nodeValue.replace(TYPED_NUMBER, '');
  return text.replace(TYPED_NUMBER, '');
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/** Index `<h2>` as stations and `<h3>` as sub-stations, giving every heading a
 *  stable id so each section is linkable. Only `<h2>` was indexed before, so
 *  the Cookie Policy's three cookie categories — the part a reader is actually
 *  hunting for — could not be navigated to at all. */
function extractSections(html: string): {
  sections: RouteStation[];
  htmlWithIds: string;
} {
  const div = document.createElement('div');
  div.innerHTML = html;
  const sections: RouteStation[] = [];
  const seen = new Set<string>();

  div.querySelectorAll('h2, h3').forEach((el) => {
    const heading = el as HTMLElement;
    const text = stripTypedNumber(heading);
    if (!text) return;
    let id = heading.id || slugify(text);
    if (!id) return;
    // Two sections can legitimately share a title ("Contact"). Ids must not.
    let n = 2;
    while (seen.has(id)) id = `${slugify(text)}-${n++}`;
    seen.add(id);
    heading.setAttribute('id', id);
    sections.push({ id, title: text, depth: heading.tagName === 'H3' ? 2 : 1 });
  });

  return { sections, htmlWithIds: div.innerHTML };
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

// ── Body HTML styling ───────────────────────────────────────────────────────
// Scoped to `.qg-cms-body`. Every size, colour and rule here is a design
// token: this used to be raw rem values, 0.5rem radii, 1px hairline tables and
// a left-border blockquote, which put the prose on a different type system
// from the chrome around it — on the same page.
const HTML_BODY_CSS = `
.qg-cms-body { max-width: 72ch; counter-reset: station; }
.qg-cms-body > :first-child { margin-top: 0; }

.qg-cms-body h2 {
  font-family: var(--font-display);
  font-size: var(--text-headline);
  line-height: 1.15;
  font-weight: 400;
  letter-spacing: -0.02em;
  margin-top: 3rem;
  margin-bottom: 1rem;
  scroll-margin-top: 8rem;
}
.qg-cms-body h3 {
  font-size: var(--text-title);
  line-height: 1.4;
  font-weight: 700;
  margin-top: 2rem;
  margin-bottom: 0.5rem;
  scroll-margin-top: 8rem;
}
.qg-cms-body h2 + p, .qg-cms-body h3 + p { margin-top: 0; }

.qg-cms-body p, .qg-cms-body li {
  font-size: var(--text-body-lg);
  line-height: 1.7;
  color: hsl(var(--foreground));
}
.qg-cms-body p { margin-bottom: 1rem; }
.qg-cms-body ul, .qg-cms-body ol { padding-left: 1.25rem; margin-bottom: 1rem; }
.qg-cms-body li { margin-bottom: 0.5rem; }
.qg-cms-body li::marker { color: hsl(var(--muted-foreground)); }
.qg-cms-body strong { font-weight: 700; }

.qg-cms-body a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
.qg-cms-body a:hover { font-weight: 700; }

/* An ink-framed block, not a side stripe — the design rules ban the
   border-left idiom outright. */
.qg-cms-body blockquote {
  border: 3px solid hsl(var(--foreground));
  padding: 1rem;
  margin: 2rem 0;
  font-style: italic;
}
.qg-cms-body blockquote p:last-child { margin-bottom: 0; }

.qg-cms-body img { max-width: 100%; height: auto; margin: 2rem 0; border: 3px solid hsl(var(--foreground)); }
.qg-cms-body pre {
  border: 2px solid hsl(var(--foreground));
  color: hsl(var(--foreground));
  padding: 1rem;
  overflow: auto;
  margin: 2rem 0;
  font-size: var(--text-13);
}
.qg-cms-body code { border: 1px solid hsl(var(--foreground)); padding: 0 0.25rem; font-size: 0.875em; }
.qg-cms-body pre code { border: none; padding: 0; }

.qg-cms-body table { border-collapse: collapse; width: 100%; margin: 2rem 0; font-size: var(--text-15); }
.qg-cms-body th, .qg-cms-body td { border: 2px solid hsl(var(--foreground)); padding: 0.5rem 0.75rem; text-align: left; }
.qg-cms-body th { background-color: hsl(var(--foreground)); color: hsl(var(--background)); font-weight: 700; }

.qg-cms-body hr { border: none; border-top: 2px solid hsl(var(--foreground)); margin: 2rem 0; }

.qg-cms-body .legal-intro {
  font-size: var(--text-body-lg);
  line-height: 1.6;
  color: hsl(var(--muted-foreground));
  margin-bottom: 2rem;
}

/* "In short —" plain-language summary. Deliberately framed and labelled so it
   can never be mistaken for the binding text it sits above. */
.qg-cms-body .station-note {
  border: 2px solid hsl(var(--foreground));
  padding: 0.75rem 1rem;
  margin: 0 0 1.5rem;
  font-size: var(--text-15);
  line-height: 1.6;
  color: hsl(var(--foreground));
}
.qg-cms-body .station-note::before {
  content: 'In short';
  display: block;
  font-size: var(--text-2xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: var(--tracking-label);
  color: hsl(var(--muted-foreground));
  margin-bottom: 0.25rem;
}

/* Station numbers on a policy. The number comes from the counter, never from
   the heading text — see stripTypedNumber. */
.qg-cms-body--legal { counter-reset: station; }
.qg-cms-body--legal h2 {
  counter-increment: station;
  position: relative;
  padding-left: 3.5rem;
  min-height: 2.5rem;
}
.qg-cms-body--legal h2::before {
  content: counter(station);
  position: absolute;
  left: 0;
  top: 0;
  width: 2.5rem;
  height: 2.5rem;
  display: grid;
  place-items: center;
  border: 3px solid hsl(var(--foreground));
  border-radius: 9999px;
  font-family: var(--font-sans);
  font-size: var(--text-15);
  font-weight: 700;
  line-height: 1;
}
@media (max-width: 640px) {
  .qg-cms-body--legal h2 { padding-left: 2.75rem; }
  .qg-cms-body--legal h2::before { width: 2rem; height: 2rem; font-size: var(--text-13); border-width: 2px; }
}

/* The authored <h1> is hidden rather than stripped so the CMS editor still
   shows the document as its author wrote it; the layout renders the real one. */
.qg-cms-body--legal h1 { display: none; }
`;

function CmsBodyStyles() {
  return <style dangerouslySetInnerHTML={{ __html: HTML_BODY_CSS }} />;
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
      className="card-lift group flex items-start gap-4 border-[3px] border-foreground bg-background p-6 text-inherit no-underline"
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
        <header className="border-b-4 border-foreground pb-6">
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

        <section className="mt-12 border-[3px] border-foreground p-6" aria-labelledby="common">
          <p className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
            Straight there
          </p>
          <h2 id="common" className="mt-1 font-display text-headline leading-tight">
            Common requests
          </h2>
          <ul className="mt-4 flex flex-col">
            {COMMON_REQUESTS.map((r) => (
              <li key={r.to} className="border-b-2 border-foreground/15 last:border-b-0">
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

        <section className="mt-8 border-[3px] border-foreground bg-foreground p-6 text-background">
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
        <CmsBodyStyles />
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
                className="mt-12 border-[3px] border-foreground p-6"
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
      <CmsBodyStyles />

      {page.cover_image_url && (
        <img
          src={page.cover_image_url}
          alt={page.cover_image_alt || page.title}
          className="mb-6 max-h-[400px] w-full border-[3px] border-foreground object-cover"
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
