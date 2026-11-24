import { useTranslation } from 'react-i18next';
import { LivePresenceControl } from '@/components/people/LivePresenceControl';
import { useNearMe } from '@/hooks/useNearMe';
import { useAuth } from '@/hooks/useAuth';
import { NearbyMap } from './NearbyMap';
import { PeopleModeView } from './PeopleModeView';

/**
 * Nearby = the one live map plus the list of people near you.
 *
 * Real-geo discovery. The viewer goes live (opt-in, ephemeral,
 * server-snapped to ~750 m, ~2 km in high-risk countries) before anyone is
 * shown, and before they appear to anyone else. The same switch serves the
 * dating map; a dating-only presence is never listed here, so the list needs
 * an Everyone or Friends presence.
 */
export function NearbyView() {
  const { t } = useTranslation();
  const { supported, liveStatus } = useNearMe();
  const { user } = useAuth();

  if (!supported) {
    return (
      <p className="text-muted-foreground">
        {t('people.nearby.unsupported', 'Location is not available on this device.')}
      </p>
    );
  }

  const listed = !!liveStatus?.written && liveStatus.audience !== 'dating';

  return (
    <div className="flex flex-col gap-6">
      <LivePresenceControl defaultAudience="everyone" />
      {/* The map reads member-only RPCs; signed-out visitors get the control's sign-in. */}
      {user && <NearbyMap />}
      {listed ? (
        <PeopleModeView
          mode="nearby"
          emptyState={
            <p className="text-muted-foreground">
              {t('people.empty.nearby', 'No one nearby right now. Check back later.')}
            </p>
          }
        />
      ) : liveStatus?.audience === 'dating' ? (
        <p className="text-13 text-muted-foreground">
          {t(
            'people.live.datingHidesNearby',
            'You are live for dating only. Choose Everyone or Friends to see who is nearby.',
          )}
        </p>
      ) : null}
    </div>
  );
}
