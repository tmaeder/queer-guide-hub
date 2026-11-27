import { useTranslation } from 'react-i18next';
import { LivePresenceControl } from '@/components/people/LivePresenceControl';
import { useNearMe } from '@/hooks/useNearMe';
import { useLocation } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
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
  const { pathname, search } = useLocation();

  // Going live writes a member presence. Signed out, the control would still ask
  // the browser for a location and then fail at the server, so offer sign-in first.
  if (!user) {
    return (
      <div className="flex flex-col items-start gap-4 rounded-container bg-card p-6 shadow-soft">
        <p className="max-w-reading text-muted-foreground">
          {t(
            'people.nearby.signIn',
            'Sign in to see members nearby. You choose who sees you, and your location is shown only as an approximate area.',
          )}
        </p>
        <Button asChild>
          <LocalizedLink
            to={`/auth?redirect=${encodeURIComponent(pathname + search)}`}
            className="no-underline"
          >
            {t('common.signIn', 'Sign in')}
          </LocalizedLink>
        </Button>
      </div>
    );
  }

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
      <NearbyMap />
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
