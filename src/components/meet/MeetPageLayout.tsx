import type { ReactNode } from 'react';
import { MeetNavBar } from './MeetNav';
import { PageContainer } from '@/components/layout/PageContainer';

/** Common task-page frame. Specialized maps and group openings keep their own bodies. */
export function MeetPageLayout({
  title,
  description,
  actions,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <MeetNavBar />
      <PageContainer flush className="pt-6 pb-8 md:pb-12">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <h1 className="text-balance font-display text-4xl leading-tight tracking-tight sm:text-5xl">
              {title}
            </h1>
            {description && (
              <p className="max-w-reading text-body text-muted-foreground">{description}</p>
            )}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
        {children}
      </PageContainer>
    </>
  );
}
