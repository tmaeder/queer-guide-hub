import type { ReactNode } from 'react';
import { MeetNavBar } from './MeetNav';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';

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
      <PageContainer>
        <PageHeader title={title} subtitle={description} actions={actions} />
        {children}
      </PageContainer>
    </>
  );
}
