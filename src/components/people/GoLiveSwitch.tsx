import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin } from '@/components/icons';
import { Switch } from '@/components/ui/switch';
import { useNearMe } from '@/hooks/useNearMe';

const ERRORS: Record<string, [string, string]> = {
  denied: ['people.nearby.denied', 'Location permission was denied. Enable it to use Nearby.'],
  unavailable: [
    'people.nearby.unavailable',
    'Could not get your location. Check that location services are on for this browser, then try again.',
  ],
  presence_failed: ['people.nearby.failed', 'Could not go live. Try again.'],
};

/**
 * "Visible nearby" on/off, the same go-live / go-invisible the Nearby page
 * uses. Location is snapped server-side (~750 m, ~2 km in high-risk areas) and
 * expires after an hour; off clears it at once.
 */
export function GoLiveSwitch() {
  const { t } = useTranslation();
  const { supported, loading, error, goLive, goInvisible, liveStatus } = useNearMe();
  const [busy, setBusy] = useState(false);
  if (!supported) return null;

  const isLive = !!liveStatus;
  const toggle = async (on: boolean) => {
    setBusy(true);
    try {
      if (on) await goLive('discovery');
      else await goInvisible();
    } finally {
      setBusy(false);
    }
  };
  const err = error ? ERRORS[error] : null;

  return (
    <div className="flex flex-col gap-1 px-2 py-1">
      <label className="flex min-h-11 items-center gap-2 text-15 font-bold">
        <MapPin size={18} aria-hidden className="shrink-0" />
        <span className="min-w-0 flex-1">
          {t('people.nearby.switch', 'Visible nearby')}
          <span className="block text-xs font-normal text-muted-foreground">
            {busy || loading
              ? t('people.nearby.locating', 'Locating…')
              : isLive
                ? liveStatus?.isHighRisk
                  ? t('people.nearby.highRisk', 'High-risk area — coarse location only')
                  : t('people.nearby.switchOn', 'Approximate location, clears within an hour')
                : t('people.nearby.switchOff', 'Off')}
          </span>
        </span>
        <Switch checked={isLive} disabled={busy || loading} onCheckedChange={toggle} />
      </label>
      {err && !isLive && <p className="text-13 text-destructive">{t(err[0], err[1])}</p>}
    </div>
  );
}
