import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin } from '@/components/icons';
import { Switch } from '@/components/ui/switch';
import { useNearMe } from '@/hooks/useNearMe';
import { GO_LIVE_ERRORS } from '@/lib/goLiveErrors';

/**
 * "Visible nearby" on/off: the same go-live / go-invisible as the Nearby page.
 * Location is snapped server-side (~750 m, ~2 km in high-risk areas) and
 * expires after an hour; off clears it at once.
 */
function useGoLive() {
  const { t } = useTranslation();
  const { supported, loading, error, goLive, goInvisible, liveStatus } = useNearMe();
  const [busy, setBusy] = useState(false);
  const isLive = !!liveStatus;
  const pending = busy || loading;

  const toggle = async (on: boolean) => {
    setBusy(true);
    try {
      if (on) await goLive('everyone');
      else await goInvisible();
    } finally {
      setBusy(false);
    }
  };

  const status = pending
    ? t('people.nearby.locating', 'Locating…')
    : isLive
      ? liveStatus?.audience === 'dating'
        ? t('people.nearby.switchDating', 'Visible for dating, as a city count only')
        : liveStatus?.isHighRisk
          ? t('people.nearby.highRisk', 'High-risk area — coarse location only')
          : t('people.nearby.switchOn', 'Approximate location, clears within an hour')
      : t('people.nearby.switchOff', 'Off');
  const err = error && !isLive ? GO_LIVE_ERRORS[error] : null;

  return {
    supported,
    isLive,
    pending,
    toggle,
    label: t('people.nearby.switch', 'Visible nearby'),
    status,
    errorText: err ? t(err[0], err[1]) : null,
  };
}

/**
 * Hub menu cell: icon, label and switch on one line. The switch shows on/off;
 * the longer status (e.g. time left) is the cell's tooltip.
 */
export function GoLiveSwitch() {
  const g = useGoLive();
  const id = useId();
  if (!g.supported) return null;
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <label
        htmlFor={id}
        title={g.status}
        className="flex min-h-11 cursor-pointer items-center gap-2 rounded-element bg-muted px-2.5"
      >
        <MapPin size={16} aria-hidden className="shrink-0" />
        <span className="min-w-0 flex-1 truncate text-13 font-bold">{g.label}</span>
        <Switch id={id} checked={g.isLive} disabled={g.pending} onCheckedChange={g.toggle} />
      </label>
      {g.errorText && <p className="px-2.5 text-13 text-destructive">{g.errorText}</p>}
    </div>
  );
}
