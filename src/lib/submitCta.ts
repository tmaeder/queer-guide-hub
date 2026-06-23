import type { TFunction } from 'i18next';

export interface SubmitCta {
  label: string;
  route: string;
}

/**
 * Context-aware "contribute" target. Maps the current route to the most
 * specific submission form (event/venue/product/hotel) and falls back to the
 * generic submit hub. Shared by the desktop Header's `+` and the mobile
 * bottom-nav's raised contribute button so the two never drift apart.
 *
 * Path matching is locale-agnostic: the optional `/:locale` prefix is stripped
 * before comparison so `/de/events` behaves like `/events`.
 */
export function getSubmitCta(pathname: string, t: TFunction): SubmitCta {
  const path = pathname.replace(/^\/(?:[a-z]{2}\/)?/, '/');
  if (path.startsWith('/events'))
    return { label: t('header.submitEvent', 'Submit Event'), route: '/submit/event' };
  if (path.startsWith('/venues'))
    return { label: t('header.submitVenue', 'Submit Venue'), route: '/submit/venue' };
  if (path.startsWith('/marketplace'))
    return { label: t('header.submitProduct', 'Submit Product'), route: '/submit/product' };
  if (path.startsWith('/hotels'))
    return { label: t('header.submitHotel', 'Submit Hotel'), route: '/submit/hotel' };
  return { label: t('header.contribute', 'Contribute'), route: '/submit' };
}
