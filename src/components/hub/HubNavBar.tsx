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
 * Before this existed the bar sat at four different offsets depending on which
 * page you were on (`py-8 md:py-12` inside the content container on GroupDetail
 * and PeopleMode, `pt-6 md:pt-8` as a sibling on Community, inside the hero
 * container on /hub/people), so it visibly jumped as you moved between hub
 * tabs. Render this, not `HubNav`, unless the bar genuinely has to live inside
 * an existing container.
 */
export function HubNavBar() {
  return (
    <PageContainer className="pb-0 pt-6 md:pt-8">
      <HubNav />
    </PageContainer>
  );
}
