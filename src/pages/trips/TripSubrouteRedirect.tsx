import { Navigate, useParams } from 'react-router';
import { DEFAULT_LOCALE, isSupportedLocale } from '@/i18n/languages';
import type { TripView } from '@/components/trips/TripViewSwitcher';

interface Props {
  view: TripView;
}

export default function TripSubrouteRedirect({ view }: Props) {
  const {
    tripId,
    locale,
    '*': path,
  } = useParams<{ tripId: string; locale: string; '*': string }>();
  const prefix =
    locale && isSupportedLocale(locale) && locale !== DEFAULT_LOCALE ? `/${locale}` : '';
  const tool = path?.split('/')[0];
  const section =
    tool && ['safety', 'packing', 'budget', 'documents', 'reservations'].includes(tool)
      ? 'prepare'
      : tool && ['collaborate', 'chat', 'journal'].includes(tool)
        ? 'together'
        : tool && ['map', 'suggestions', 'build-days', 'ai'].includes(tool)
          ? 'plan'
          : null;
  const search = new URLSearchParams({ view });
  if (view === 'plan' && section && tool) {
    search.set('section', section);
    search.set('tool', tool);
  }
  if (!tripId) return <Navigate to={`${prefix}/trips`} replace />;
  return <Navigate to={`${prefix}/trips/${tripId}?${search}`} replace />;
}
