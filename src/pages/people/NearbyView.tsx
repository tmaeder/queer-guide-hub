import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, EyeOff, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNearMe } from '@/hooks/useNearMe';
import { PeopleModeView } from './PeopleModeView';

/**
 * Nearby = real-geo discovery. The viewer must explicitly "go live" (opt-in,
 * ephemeral, server-fuzzed) before anyone is shown — and before they appear to
 * anyone else. "Go invisible" removes them instantly. Location is never exact:
 * presence_upsert snaps to a ~750m grid (~2km in high-risk countries).
 */
export function NearbyView() {
  const { t } = useTranslation();
  const { supported, loading, error, goLive, goInvisible, liveStatus } = useNearMe();
  const [busy, setBusy] = useState(false);

  const isLive = !!liveStatus?.written;

  const handleGoLive = async () => {
    setBusy(true);
    try {
      await goLive('discovery');
    } finally {
      setBusy(false);
    }
  };

  if (!supported) {
    return (
      <p className="text-muted-foreground">
        {t('people.nearby.unsupported', 'Location is not available on this device.')}
      </p>
    );
  }

  if (!isLive) {
    return (
      <div className="mx-auto max-w-md border-[3px] border-foreground bg-background p-6 text-center">
        <MapPin className="mx-auto mb-4 h-8 w-8 text-muted-foreground" aria-hidden />
        <h2 className="mb-2 font-display text-headline">
          {t('people.nearby.goLiveTitle', 'Go live to see who’s nearby')}
        </h2>
        <p className="mb-2 text-13 text-muted-foreground">
          {t(
            'people.nearby.goLiveBody',
            'Your location is approximate (snapped to ~750m), shared only while you’re live, and clears on its own.',
          )}
        </p>
        <Button variant="accent" onClick={handleGoLive} disabled={busy || loading} className="mt-4">
          {busy || loading
            ? t('people.nearby.locating', 'Locating…')
            : t('people.nearby.goLive', 'Go live')}
        </Button>
        {error === 'denied' && (
          <p className="mt-4 text-13 text-destructive">
            {t('people.nearby.denied', 'Location permission was denied. Enable it to use Nearby.')}
          </p>
        )}
        {error === 'presence_failed' && (
          <p className="mt-4 text-13 text-destructive">
            {t('people.nearby.failed', 'Could not go live. Try again.')}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Ink only, and no lift. Two rules meet here: a track colour may never
          encode a state (and "you are live" is a state, on a bar that also
          carries the high-risk-country warning), and a lift on a container
          that is not itself a click target promises an interaction that does
          not exist. */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-[3px] border-foreground bg-background px-4 py-2">
        <span className="flex items-center gap-2 text-13 font-bold">
          <span className="h-3 w-3 rounded-full bg-foreground" aria-hidden />
          {t('people.nearby.live', 'You’re visible nearby')}
          {liveStatus?.isHighRisk && (
            <span className="inline-flex items-center gap-1 font-medium text-muted-foreground">
              <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
              {t('people.nearby.highRisk', 'High-risk area — coarse location only')}
            </span>
          )}
        </span>
        <Button variant="outline" size="sm" onClick={goInvisible} className="gap-2">
          <EyeOff className="h-3.5 w-3.5" aria-hidden />
          {t('people.nearby.goInvisible', 'Go invisible')}
        </Button>
      </div>

      <PeopleModeView
        mode="nearby"
        emptyState={
          <p className="text-muted-foreground">
            {t('people.empty.nearby', 'No one nearby right now. Check back later.')}
          </p>
        }
      />
    </div>
  );
}
