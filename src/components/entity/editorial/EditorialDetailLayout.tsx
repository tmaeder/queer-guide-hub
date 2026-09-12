import { useEffect, useMemo, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { motion, useScroll, useSpring } from 'motion/react';
import { useBreadcrumbs } from '@/contexts/BreadcrumbContext';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { SectionNav } from './SectionNav';
import { useActiveSection } from '@/components/transit/useActiveSection';
import { EditorialSection } from './EditorialSection';
import type { SectionDef } from './types';
import { PageContainer } from '@/components/layout/PageContainer';

export interface EditorialBreadcrumb {
  label: ReactNode;
  href?: string;
}

export interface EditorialDetailLayoutProps {
  loading: boolean;
  error: Error | null;
  breadcrumbs?: EditorialBreadcrumb[];
  /** Editorial header — hero + intro + key facts + editor's picks composed by the page. */
  header: ReactNode;
  /** Optional thin strip rendered between header and section nav (e.g. TripCoveringBanner). */
  banner?: ReactNode;
  sections: SectionDef[];
  /** Optional footer slot rendered after the last section (e.g. SimilarItems, MarketplaceForCity). */
  footer?: ReactNode;
  entityType: string;
  entityId?: string;
  /**
   * Suppress the animated scroll-progress bar.
   *
   * Set on crisis-adjacent surfaces (/rights, and anything under /help,
   * /safety, /report-*), where the design system requires functional motion
   * only. The bar is a `motion.div` driven by useScroll/useSpring and would
   * otherwise animate unconditionally on every page using this layout.
   */
  disableProgress?: boolean;
}

/**
 * Editorial peer to EntityDetailLayout. Long-scroll, anchored sections, sticky nav.
 * Keeps ?tab= deep-links working by redirecting to ?section= when ids overlap 1:1.
 */
export function EditorialDetailLayout({
  loading,
  error,
  breadcrumbs,
  header,
  banner,
  sections,
  footer,
  entityType: _entityType,
  entityId: _entityId,
  disableProgress = false,
}: EditorialDetailLayoutProps) {
  // Publish the trail to the global breadcrumb bar (rendered in LayoutShell).
  useBreadcrumbs(breadcrumbs ?? null);

  const [searchParams, setSearchParams] = useSearchParams();

  // A section with nothing in it must not leave a heading behind.
  //
  // `EditorialSection` emits kicker + <h2> + action unconditionally, and this
  // layout also feeds every section to `SectionNav`. So an empty `content`
  // produced a full heading block, a "see all" link and a live nav anchor over
  // an empty <div> — verified in production on /going-out's "Scenes" (Zürich,
  // no landmarks) and reachable on /shop's "Categories" on every first paint.
  //
  // Filtering here rather than in each page fixes all six intent pages plus
  // /city/:slug at once; /people previously carried its own local `.filter()`.
  // `hidden` covers what this cannot detect — a valid element whose component
  // returns null (see SectionDef.hidden).
  const visibleSections = useMemo(
    () =>
      sections.filter((s) => {
        if (s.hidden) return false;
        const c = s.content;
        if (c === null || c === undefined || c === false) return false;
        if (Array.isArray(c) && c.length === 0) return false;
        return true;
      }),
    [sections],
  );

  const sectionIds = useMemo(() => visibleSections.map((s) => s.id), [visibleSections]);
  const [activeId, selectSection] = useActiveSection(sectionIds);

  // Legacy ?tab= → ?section= redirect (1:1 mapping). One-shot per navigation.
  useEffect(() => {
    const tab = searchParams.get('tab');
    const section = searchParams.get('section');
    if (tab && !section && sectionIds.includes(tab)) {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.delete('tab');
          p.set('section', tab);
          return p;
        },
        { replace: true },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionIds.join('|')]);

  // Initial scroll to ?section= target after sections mount.
  useEffect(() => {
    // visibleSections, not sections: a ?section= pointing at a filtered-out
    // section must not scroll to an element that was never rendered.
    if (loading || visibleSections.length === 0) return;
    const target = searchParams.get('section');
    if (!target || !sectionIds.includes(target)) return;
    const el = document.getElementById(target);
    if (el) {
      // queueMicrotask so the layout has painted before we scroll
      queueMicrotask(() => el.scrollIntoView({ block: 'start' }));
      selectSection(target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, sectionIds.join('|')]);

  // Persist active section to URL on change (debounced via timeout).
  //
  // Two things here are load-bearing and both were bugs until 2026-09-12.
  //
  // 1. The write is skipped when the URL already says what we are about to
  //    write. React Router mints a NEW location object for every
  //    setSearchParams call even when the resulting URL is byte-identical, and
  //    anything keyed on `location` then treats it as a navigation. Measured on
  //    prod: /travel alone recorded 268,313 page views across 981 sessions in
  //    30 days, and 1,244 such sessions produced 59% of ALL site traffic. One
  //    session fired 582 views of /travel in 233 seconds — 2.5/s, i.e. exactly
  //    this 300ms timer running as a clock.
  //
  // 2. The dep array takes `sectionIds.join('|')`, not the array itself.
  //    `sectionIds` is a useMemo over `visibleSections`, so it gets a fresh
  //    identity whenever that recomputes and re-arms the timer on renders where
  //    nothing about the sections changed. The two effects above already use
  //    the joined form for the same reason.
  useEffect(() => {
    if (!activeId) return;
    const handle = setTimeout(() => {
      const next = activeId === sectionIds[0] ? null : activeId;
      // Read the live URL rather than the `searchParams` of the render that
      // armed this timer: this effect is the only writer of ?section=, and
      // reading it live keeps `searchParams` out of the dep array (where it
      // would re-arm the timer on every write it had just made).
      //
      // The check has to happen HERE, not inside the updater — returning the
      // params unchanged from the updater does not stop React Router calling
      // navigate(), so it would still mint a fresh location and still be
      // counted as a page view.
      if (new URLSearchParams(window.location.search).get('section') === next) return;
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next === null) p.delete('section');
          else p.set('section', next);
          return p;
        },
        { replace: true },
      );
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, sectionIds.join('|'), setSearchParams]);

  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 200, damping: 30 });

  if (error) {
    return (
      <PageContainer data-testid="editorial-detail-error">
        <Alert variant="destructive">
          <AlertTitle>Failed to load</AlertTitle>
          <AlertDescription>{error.message || 'Something went wrong.'}</AlertDescription>
        </Alert>
      </PageContainer>
    );
  }

  if (loading) {
    return (
      <PageContainer data-testid="editorial-detail-loading">
        <Skeleton variant="rectangular" height={32} style={{ width: '40%' }} className="mb-4" />
        <Skeleton variant="rectangular" height={320} className="mb-8 rounded-container" />
        <Skeleton variant="rectangular" height={120} className="mb-8 rounded-container" />
      </PageContainer>
    );
  }

  return (
    <>
      {disableProgress ? null : (
        <motion.div
          style={{ scaleX, transformOrigin: '0%' }}
          className="fixed top-0 left-0 right-0 h-[2px] bg-foreground z-[1200]"
        />
      )}
      <PageContainer data-testid="editorial-detail-layout">
        <div className="mb-8">{header}</div>

        {banner ? <div className="mb-6">{banner}</div> : null}

        <SectionNav
          items={visibleSections.map((s) => ({ id: s.id, label: s.label }))}
          activeId={activeId}
          onSelect={selectSection}
        />

        <div>
          {visibleSections.map((s) => (
            <EditorialSection
              key={s.id}
              id={s.id}
              label={s.label}
              kicker={s.kicker}
              description={s.description}
              action={s.action}
            >
              {s.content}
            </EditorialSection>
          ))}
        </div>

        {footer ? <div className="mt-12">{footer}</div> : null}
      </PageContainer>
    </>
  );
}

export default EditorialDetailLayout;
