import { PageContainer } from '@/components/layout/PageContainer';
import { PeopleNav } from './PeopleNav';

/** Keeps focused People subroutes connected to the wider workspace. */
export function PeopleSubpageNav() {
  return (
    <PageContainer className="pb-0 pt-6 md:pt-8">
      <PeopleNav />
    </PageContainer>
  );
}
