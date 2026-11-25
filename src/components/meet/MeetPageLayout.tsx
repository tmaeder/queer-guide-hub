import type { ReactNode } from 'react';
import { MeetNavBar } from './MeetNav';
import { PageContainer } from '@/components/layout/PageContainer';
import { cn } from '@/lib/utils';
import { PageIntro } from '@/components/layout/PageIntro';

/** Common task-page frame. Specialized maps and group openings keep their own bodies. */
export function MeetPageLayout({
  title,
  description,
  actions,
  opening,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** An editorial opening, as used on the main discovery pages. */
  opening?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <MeetNavBar />
      <PageContainer flush className="pt-6 pb-8 md:pb-12">
        <header
          className={cn(
            'mb-6 flex flex-wrap items-start justify-between gap-4',
            opening &&
              'mb-8 grid gap-8 py-2 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:gap-12 lg:py-6',
          )}
        >
          {opening ? (
            <div className="min-w-0">
              <PageIntro title={title} lede={description} />
              {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
            </div>
          ) : (
            <div className="min-w-0 space-y-2">
              <h1 className="text-balance font-display text-4xl leading-tight tracking-tight sm:text-5xl">
                {title}
              </h1>
              {description && (
                <p className="max-w-reading text-body text-muted-foreground">{description}</p>
              )}
            </div>
          )}
          {opening ??
            (actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>)}
        </header>
        {children}
      </PageContainer>
    </>
  );
}
