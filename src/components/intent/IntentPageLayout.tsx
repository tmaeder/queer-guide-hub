import type { ReactNode } from 'react';
import { EditorialDetailLayout, type SectionDef } from '@/components/entity/editorial';
import { PageHero } from '@/components/discovery';
import { cn } from '@/lib/utils';

export interface IntentPageLayoutProps {
  /** Optional page-specific hero. Defaults to the shared PageHero treatment. */
  header?: ReactNode;
  topNav?: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  /** Scope controls (city picker, date presets) rendered under the hero. */
  scopeBar?: ReactNode;
  /** Primary interactive surface rendered before the long-page section index. */
  featured?: ReactNode;
  sections: SectionDef[];
  footer?: ReactNode;
  loading?: boolean;
  error?: Error | null;
  /** Crisis-adjacent pages suppress the scroll-progress animation. */
  disableProgress?: boolean;
  breadcrumbLabel: string;
  breadcrumbHref: string;
  sectionNavVariant?: 'default' | 'subway';
  className?: string;
  heroSize?: 'sm' | 'md' | 'lg';
  heroClassName?: string;
}

/**
 * Shared shell for the Intent Router pages.
 *
 * Intentionally a thin wrapper over `EditorialDetailLayout` rather than a new
 * layout: that component is already entity-agnostic (its `entityType`/`entityId`
 * props are unused) and it brings the whole composite-page contract with it —
 * sticky section nav, `?section=` deep links, scroll restoration, the legacy
 * `?tab=` redirect, and consistent loading/error states. `/city/:slug` is the
 * proven implementation of that pattern and the intent pages are five more of
 * it, so they should share the machinery rather than re-grow it.
 *
 * The one thing entity pages do not need, and this adds, is the scope bar: an
 * intent page is a question about a place and a time, so it has controls a
 * detail page does not.
 */
export function IntentPageLayout({
  header,
  topNav,
  eyebrow,
  title,
  lede,
  scopeBar,
  featured,
  sections,
  footer,
  loading = false,
  error = null,
  disableProgress = false,
  breadcrumbLabel,
  breadcrumbHref,
  sectionNavVariant = 'default',
  className,
  heroSize = 'md',
  heroClassName,
}: IntentPageLayoutProps) {
  return (
    <div className={cn(className)}>
      <EditorialDetailLayout
        loading={loading}
        error={error}
        entityType="intent"
        disableProgress={disableProgress}
        breadcrumbs={[{ label: breadcrumbLabel, href: breadcrumbHref }]}
        sectionNavVariant={sectionNavVariant}
        header={
          <>
            {topNav}
            {header ?? (
              /* `bare` — EditorialDetailLayout already puts this inside a
                 PageContainer, and two nested containers double the gutter. */
              <PageHero
                bare
                eyebrow={eyebrow}
                title={title}
                lede={lede}
                size={heroSize}
                className={heroClassName}
              />
            )}
            {scopeBar ? <div className="mt-6">{scopeBar}</div> : null}
            {featured ? <div className="mt-8">{featured}</div> : null}
          </>
        }
        sections={sections}
        footer={footer}
      />
    </div>
  );
}

export default IntentPageLayout;
