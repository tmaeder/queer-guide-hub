import { Fragment } from 'react';
import { useBreadcrumbs } from '@/contexts/BreadcrumbContext';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { SimilarItems } from '@/components/discovery/SimilarItems';
import { MoreLikeThisByTag } from '@/components/tags/MoreLikeThisByTag';
import { SinglePage } from '@/components/transit/SinglePage';
import { SingleSectionList, SingleRouteRail } from '@/components/transit/SingleSections';
import { singleSections, useSingleActiveSection } from '@/components/transit/singleSectionModel';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { PageContainer } from '@/components/layout/PageContainer';
import type { EntityDescriptor } from '@/components/entity/entityDescriptor';

/**
 * The subway single, rendered from an `EntityDescriptor`.
 *
 * Sibling of `EntityDetailScroll`, not a replacement: that shell still serves
 * organisations and milestones, and this one takes any descriptor that carries
 * a `single` block. Venue moved first because it was already half-migrated —
 * it had `FactGrid`, `HoursTable`, `MapInset` and `NestedEntityCard` inside a
 * hand-rolled layout, which is the worst of both.
 *
 * Sections and route-rail stations come from one filtered array
 * (`singleSectionModel`), so a station cannot outlive the section it points at.
 */
export function EntitySingle({
  descriptor,
  loading,
  error,
}: {
  descriptor: EntityDescriptor | null;
  loading: boolean;
  error: Error | null;
}) {
  useBreadcrumbs(descriptor?.breadcrumbs ?? null);

  const sections = singleSections(
    (descriptor?.sections ?? [])
      .filter((s) => s.when !== false)
      .map((s) => ({
        id: s.id,
        title: s.title ?? s.id,
        content: <Fragment>{s.render()}</Fragment>,
      })),
  );
  const { activeId, select } = useSingleActiveSection(sections);

  if (error) {
    return (
      <PageContainer data-testid="entity-detail-error">
        <Alert variant="destructive">
          <AlertTitle>Failed to load</AlertTitle>
          <AlertDescription>{error.message || 'Something went wrong.'}</AlertDescription>
        </Alert>
      </PageContainer>
    );
  }

  if (loading || !descriptor) {
    return (
      <PageContainer data-testid="entity-detail-loading">
        <TrackLoader label="Loading" />
      </PageContainer>
    );
  }

  const single = descriptor.single ?? {};
  const { related, mobileBar, overlays } = descriptor;

  return (
    <>
      <SinglePage
        type={descriptor.source}
        eyebrow={single.eyebrow}
        title={descriptor.title}
        status={single.status}
        lead={single.lead}
        tags={single.tags}
        action={single.action}
        body={
          <>
            {single.bodyLead}
            <SingleRouteRail
              sections={sections}
              activeId={activeId}
              onNavigate={select}
              orientation="horizontal"
              track={single.track}
              label="Sections"
              className="lg:hidden"
            />
            <SingleSectionList sections={sections} />
          </>
        }
        rail={
          single.rail ? (
            <>
              {single.rail}
              <SingleRouteRail
                sections={sections}
                activeId={activeId}
                onNavigate={select}
                orientation="vertical"
                track={single.track}
                label="Sections"
                className="hidden lg:block"
              />
            </>
          ) : undefined
        }
        footer={
          related ? (
            <div className="flex flex-col gap-12 pb-28 md:pb-12">
              <SimilarItems entity={{ type: related.type, id: related.id }} title={related.title} />
              <MoreLikeThisByTag entityType={related.type} entityId={related.id} />
            </div>
          ) : undefined
        }
      />
      {overlays}
      {mobileBar}
    </>
  );
}

export default EntitySingle;
