import { PageContainer } from '@/components/layout/PageContainer';
import { HubNav } from '@/components/hub/HubNav';

/**
 * The hub's wayfinding bar, placed identically on every `/hub/*` route.
 *
 * It owns the container and the top offset so no page has to, and it is always
 * a SIBLING above the page's own content container — never nested inside one.
 * `pb-0` is what makes that safe: the content container below supplies the gap,
 * so the two never stack their vertical padding (the doubled-gap trap
 * PeopleMode's own comment records).
 *
 */
export function HubNavBar() {
  return (
    <PageContainer className="pb-0 pt-6 md:pt-8">
      <HubNav />
    </PageContainer>
  );
}
