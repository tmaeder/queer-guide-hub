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
    return <p className="text-muted-foreground">{t('people.nearby.unsupported', 'Location is not available on this device.')}</p>;
  }

  if (!isLive) {
    return (
      <div className="mx-auto max-w-md rounded-container border border-border p-6 text-center">
        <MapPin className="mx-auto mb-4 h-8 w-8 text-muted-foreground" aria-hidden />
        <h2 className="mb-2 text-title font-display">{t('people.nearby.goLiveTitle', 'Go live to see who’s nearby')}</h2>
        <p className="mb-2 text-sm text-muted-foreground">
          {t(
            'people.nearby.goLiveBody',
            'Your location is approximate (snapped to ~750m), shared only while you’re live, and clears on its own.',
          )}
        </p>
        <Button variant="accent" onClick={handleGoLive} disabled={busy || loading} className="mt-4">
          {busy || loading ? t('people.nearby.locating', 'Locating…') : t('people.nearby.goLive', 'Go live')}
        </Button>
        {error === 'denied' && (
          <p className="mt-4 text-sm text-destructive">
            {t('people.nearby.denied', 'Location permission was denied. Enable it to use Nearby.')}
          </p>
        )}
        {error === 'presence_failed' && (
          <p className="mt-4 text-sm text-destructive">
            {t('people.nearby.failed', 'Could not go live. Try again.')}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-element border border-border px-4 py-2.5">
        <span className="flex items-center gap-2 text-sm">
          <span className="h-2 w-2 rounded-full bg-foreground" aria-hidden />
          {t('people.nearby.live', 'You’re visible nearby')}
          {liveStatus?.isHighRisk && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
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
        emptyHint={t('people.empty.nearby', 'No one nearby right now. Check back later.')}
      />
    </div>
  );
}
