import type { ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { PeopleMode } from '@/hooks/usePeopleDiscovery';
import { usePeopleCards } from '@/hooks/usePeopleCards';
import { PersonCard } from '@/components/people/PersonCard';
import { PeopleDiscoveryError, PeopleSignInNotice } from '@/components/people/PeopleDiscoveryState';
import { useTranslation } from 'react-i18next';

/** Shared ranked grid. Eligibility and consent remain server-owned. */
export function PeopleModeView({
  mode,
  emptyState,
  cityId,
  tripId,
  eventId,
}: {
  mode: PeopleMode;
  emptyState: ReactNode;
  cityId?: string;
  tripId?: string;
  eventId?: string;
}) {
  const { user, loading: authLoading } = useAuth();
  const { t } = useTranslation();
  const { cards, isLoading, isError, retry } = usePeopleCards({
    mode,
    cityId,
    tripId,
    eventId,
    limit: 60,
  });

  if (!authLoading && !user) return <PeopleSignInNotice />;
  if (isError) return <PeopleDiscoveryError retry={retry} />;
  if (authLoading || isLoading) {
    return (
      <div
        role="status"
        aria-label={t('meetConsolidation.discovery.loading', 'Loading people')}
        className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4"
      >
        {Array.from({ length: 8 }, (_, i) => (
          <PersonCard key={i} loading fullWidth />
        ))}
      </div>
    );
  }
  if (cards.length === 0) return <>{emptyState}</>;
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
      {cards.map((person) => (
        <PersonCard key={person.userId} person={person} fullWidth />
      ))}
    </div>
  );
}
