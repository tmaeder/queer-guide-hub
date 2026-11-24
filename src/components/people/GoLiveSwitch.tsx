import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin } from '@/components/icons';
import { Switch } from '@/components/ui/switch';
import { DropdownMenuCheckboxItem } from '@/components/ui/dropdown-menu';
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
      if (on) await goLive('discovery');
      else await goInvisible();
    } finally {
      setBusy(false);
    }
  };

  const status = pending
    ? t('people.nearby.locating', 'Locating…')
    : isLive
      ? liveStatus?.isHighRisk
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

/** Mobile Hub menu row (same anatomy as the vibe row above it). */
export function GoLiveSwitch() {
  const g = useGoLive();
  const id = useId();
  if (!g.supported) return null;
  return (
    <div className="flex flex-col gap-1 px-4 py-2">
      <label htmlFor={id} className="flex min-h-10 cursor-pointer items-center gap-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-card">
          <MapPin size={18} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-15 font-bold">{g.label}</span>
          <span className="block truncate text-xs text-muted-foreground">{g.status}</span>
        </span>
        <Switch id={id} checked={g.isLive} disabled={g.pending} onCheckedChange={g.toggle} />
      </label>
      {g.errorText && <p className="ps-13 text-13 text-destructive">{g.errorText}</p>}
    </div>
  );
}

/** Desktop account-menu item. Stays open on select so the result is visible. */
export function GoLiveMenuItem() {
  const g = useGoLive();
  if (!g.supported) return null;
  return (
    <DropdownMenuCheckboxItem
      checked={g.isLive}
      disabled={g.pending}
      onSelect={(e) => e.preventDefault()}
      onCheckedChange={(v) => void g.toggle(v === true)}
      className="items-start"
    >
      <span className="flex min-w-0 flex-col">
        <span className="flex items-center gap-2">
          <MapPin size={16} aria-hidden />
          {g.label}
        </span>
        <span className="text-xs text-muted-foreground">{g.status}</span>
        {g.errorText && <span className="text-xs text-destructive">{g.errorText}</span>}
      </span>
    </DropdownMenuCheckboxItem>
  );
}
