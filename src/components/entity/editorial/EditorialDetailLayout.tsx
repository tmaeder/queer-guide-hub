import { useEffect, useMemo, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { motion, useScroll, useSpring } from 'motion/react';
import { useBreadcrumbs } from '@/contexts/BreadcrumbContext';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { SectionNav } from './SectionNav';
import { useActiveSection } from './useActiveSection';
import { EditorialSection } from './EditorialSection';
import type { SectionDef } from './types';

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
}: EditorialDetailLayoutProps) {
  // Publish the trail to the global breadcrumb bar (rendered in LayoutShell).
  useBreadcrumbs(breadcrumbs ?? null);

  const [searchParams, setSearchParams] = useSearchParams();
  const sectionIds = useMemo(() => sections.map((s) => s.id), [sections]);
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
    if (loading || sections.length === 0) return;
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
  useEffect(() => {
    if (!activeId) return;
    const handle = setTimeout(() => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (activeId === sectionIds[0]) p.delete('section');
          else p.set('section', activeId);
          return p;
        },
        { replace: true },
      );
    }, 300);
    return () => clearTimeout(handle);
  }, [activeId, sectionIds, setSearchParams]);

  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 200, damping: 30 });

  if (error) {
    return (
      <div className="container mx-auto py-8" data-testid="editorial-detail-error">
        <Alert variant="destructive">
          <AlertTitle>Failed to load</AlertTitle>
          <AlertDescription>{error.message || 'Something went wrong.'}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container mx-auto py-8" data-testid="editorial-detail-loading">
        <Skeleton variant="rectangular" height={32} style={{ width: '40%' }} className="mb-4" />
        <Skeleton variant="rectangular" height={320} className="mb-8 rounded-container" />
        <Skeleton variant="rectangular" height={120} className="mb-8 rounded-container" />
      </div>
    );
  }

  return (
    <>
      <motion.div
        style={{ scaleX, transformOrigin: '0%' }}
        className="fixed top-0 left-0 right-0 h-[2px] bg-foreground z-[1200]"
      />
      <div className="container mx-auto px-4 py-8" data-testid="editorial-detail-layout">
        <div className="mb-8">{header}</div>

        {banner ? <div className="mb-6">{banner}</div> : null}

        <SectionNav
          items={sections.map((s) => ({ id: s.id, label: s.label }))}
          activeId={activeId}
          onSelect={selectSection}
        />

        <div>
          {sections.map((s) => (
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
      </div>
    </>
  );
}

export default EditorialDetailLayout;
