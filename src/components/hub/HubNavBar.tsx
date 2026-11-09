import { PageContainer } from '@/components/layout/PageContainer';
import { HubNav } from '@/components/hub/HubNav';

/**
 * The desktop Hub bar. On phones, the bottom dock supplies Hub navigation.
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
    <PageContainer className="hidden pb-0 pt-8 md:block">
      <HubNav />
    </PageContainer>
  );
}
