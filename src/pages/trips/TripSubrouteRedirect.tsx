import { Navigate, useParams } from 'react-router';
import type { TripView } from '@/components/trips/TripViewSwitcher';

interface Props {
  view: TripView;
}

export default function TripSubrouteRedirect({ view }: Props) {
  const { tripId } = useParams<{ tripId: string }>();
  if (!tripId) return <Navigate to="/trips" replace />;
  return <Navigate to={`/trips/${tripId}?view=${view}`} replace />;
}
