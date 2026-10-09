import { PageContainer } from '@/components/layout/PageContainer';
import { HubNav } from '@/components/hub/HubNav';

/** Keeps focused connection subroutes inside the unified Hub wayfinding. */
export function PeopleSubpageNav() {
  return (
    <PageContainer className="pb-0 pt-6 md:pt-8">
      <HubNav />
    </PageContainer>
  );
}
