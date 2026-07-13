import { Fragment } from 'react';
import { motion, useScroll, useSpring } from 'motion/react';
import { useBreadcrumbs } from '@/contexts/BreadcrumbContext';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { SimilarItems } from '@/components/discovery/SimilarItems';
import { MoreLikeThisByTag } from '@/components/tags/MoreLikeThisByTag';
import { EntityPersonalizationBand } from '@/components/entity/EntityPersonalizationBand';
import type { EntityDescriptor } from '@/components/entity/entityDescriptor';

export interface EntityDetailScrollProps {
  descriptor: EntityDescriptor | null;
  loading: boolean;
  error: Error | null;
}

/**
 * Single-scroll shell for entity detail pages (venues + organisations).
 * No tabs: it renders hero → personalisation band → grid(sections | sidebar)
 * → ONE related rail, plus the sticky mobile bar and any overlays. The tabbed
 * `EntityDetailLayout` still serves city/country.
 */
export function EntityDetailScroll({ descriptor, loading, error }: EntityDetailScrollProps) {
  // Publish the trail to the global breadcrumb bar (rendered in LayoutShell).
  useBreadcrumbs(descriptor?.breadcrumbs ?? null);

  // Scroll-progress bar — functional chrome (conveys reading position), not
  // decorative motion, so it stays under the design-system motion rule.
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 200, damping: 30 });

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8" data-testid="entity-detail-error">
        <Alert variant="destructive">
          <AlertTitle>Failed to load</AlertTitle>
          <AlertDescription>{error.message || 'Something went wrong.'}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (loading || !descriptor) {
    return (
      <div className="container mx-auto px-4 py-8" data-testid="entity-detail-loading">
        <Skeleton variant="rectangular" height={32} style={{ width: '40%' }} className="mb-4" />
        <Skeleton variant="rectangular" height={192} className="mb-6 rounded-container" />
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-6">
          <Skeleton variant="rectangular" height={320} className="rounded-container" />
          <Skeleton variant="rectangular" height={240} className="rounded-container" />
        </div>
      </div>
    );
  }

  const { hero, sections, sidebar, related, mobileBar, overlays, personalization } = descriptor;
  const visibleSections = sections.filter((s) => s.when !== false);

  return (
    <>
      <motion.div
        style={{ scaleX, transformOrigin: '0%' }}
        className="fixed top-0 left-0 right-0 h-[2px] bg-foreground z-[1200]"
      />
      <div className="container mx-auto px-4 py-8" data-testid="entity-detail-layout">
        <div className="mb-6">{hero}</div>

        {personalization && (
          <EntityPersonalizationBand inputs={personalization} className="mb-6" />
        )}

        <div className={`grid grid-cols-1 ${sidebar ? 'md:grid-cols-[2fr_1fr]' : ''} gap-6`}>
          <div className="flex flex-col gap-10">
            {visibleSections.map((section) => (
              <Fragment key={section.id}>{section.render()}</Fragment>
            ))}
          </div>
          {sidebar && <div>{sidebar}</div>}
        </div>

        {related && (
          <div className="pb-28 md:pb-12">
            <SimilarItems
              entity={{ type: related.type, id: related.id }}
              title={related.title}
              className="mt-10"
            />
            {/* Cross-entity tag rail: `related` carries the current entity's
                own type+id for both EntityDetailScroll adapters (venue, org),
                so it doubles as the source for tag-based discovery. Renders
                nothing until ≥3 tag-related items exist. */}
            <MoreLikeThisByTag
              entityType={related.type}
              entityId={related.id}
              className="mt-10"
            />
          </div>
        )}
      </div>

      {overlays}
      {mobileBar}
    </>
  );
}

export default EntityDetailScroll;
