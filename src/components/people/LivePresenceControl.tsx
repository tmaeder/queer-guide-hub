import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock3, EyeOff, MapPin, ShieldAlert } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useNearMe, type PresenceAudience } from '@/hooks/useNearMe';
import { useMyIntimateProfile } from '@/hooks/useIntimateProfile';
import { useOptimizedCities } from '@/hooks/usePlaces';
import { GO_LIVE_ERRORS } from '@/lib/goLiveErrors';
import { cn } from '@/lib/utils';

const DURATIONS = [30, 60, 120, 240] as const;

/**
 * The one live switch for Nearby and the dating map. One presence per member,
 * one audience at a time:
 * - Everyone / Friends: shown per person in Nearby, location snapped server-side.
 * - Dating only: counted per city on the dating map, never listed in Nearby.
 * Location comes from the device; when that fails, a city stands in (city precision).
 */
export function LivePresenceControl({
  defaultAudience = 'everyone',
}: {
  defaultAudience?: PresenceAudience;
}) {
  const { t } = useTranslation();
  const { loading, error, goLive, goInvisible, liveStatus } = useNearMe();
  const { data: intimate } = useMyIntimateProfile();
  const datingAllowed = !!intimate?.opted_in_at;
  const [picked, setAudience] = useState<PresenceAudience>(defaultAudience);
  // Derived, so a profile that is still loading does not lock in "Everyone".
  const audience: PresenceAudience = picked === 'dating' && !datingAllowed ? 'everyone' : picked;
  const [duration, setDuration] = useState<number>(60);
  const [busy, setBusy] = useState(false);
  const [ackOpen, setAckOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [citySearch, setCitySearch] = useState('');
  const [cityId, setCityId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  const needsCity = error === 'denied' || error === 'unavailable';
  const { cities, loading: citiesLoading } = useOptimizedCities({
    search: citySearch,
    limit: 8,
    enabled: needsCity,
  });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const audiences: { value: PresenceAudience; label: string }[] = [
    { value: 'everyone', label: t('people.live.everyone', 'Everyone') },
    { value: 'friends', label: t('people.live.friends', 'Friends') },
    { value: 'dating', label: t('people.live.dating', 'Dating only') },
  ];

  const start = async (safetyAcknowledged = false) => {
    if (
      audience === 'dating' &&
      !intimate?.presence_safety_acknowledged_at &&
      !safetyAcknowledged
    ) {
      setAckOpen(true);
      return;
    }
    setBusy(true);
    try {
      const status = await goLive(audience, {
        durationMinutes: duration,
        cityId: needsCity ? cityId : null,
        safetyAcknowledged,
      });
      if (status) setAckOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    try {
      await goInvisible();
    } finally {
      setBusy(false);
    }
  };

  const live =
    liveStatus?.expiresAt && new Date(liveStatus.expiresAt).getTime() > now ? liveStatus : null;

  if (live) {
    const until = new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(live.expiresAt!));
    const who = audiences.find((a) => a.value === live.audience)?.label ?? '';
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-container bg-surface-container px-4 py-4">
        <span className="flex flex-col gap-1 text-13">
          <span className="flex items-center gap-2 font-bold">
            <span className="h-3 w-3 rounded-full bg-foreground" aria-hidden />
            {t('people.live.visibleTo', 'Live for {{who}} until {{time}}', { who, time: until })}
          </span>
          <span className="text-muted-foreground">
            {live.audience === 'dating'
              ? t('people.live.datingNote', 'Opted-in members see only a count for your city.')
              : t(
                  'people.live.nearbyNote',
                  'Members who are live see you nearby, never your exact spot.',
                )}
          </span>
          {live.isHighRisk && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
              {t('people.nearby.highRisk', 'High-risk area — coarse location only')}
            </span>
          )}
        </span>
        <Button variant="soft" size="sm" onClick={stop} disabled={busy} className="gap-2">
          <EyeOff className="h-3.5 w-3.5" aria-hidden />
          {t('people.nearby.goInvisible', 'Go invisible')}
        </Button>
      </div>
    );
  }

  const err = error ? GO_LIVE_ERRORS[error] : null;

  return (
    <div className="flex flex-col gap-4 rounded-container bg-surface-container p-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">
          {t('people.live.audience', 'Who sees you')}
        </legend>
        <div className="grid grid-cols-3 gap-1 rounded-container bg-background p-1">
          {audiences.map((a) => {
            const disabled = a.value === 'dating' && !datingAllowed;
            return (
              <label
                key={a.value}
                className={cn(
                  'flex min-h-11 cursor-pointer items-center justify-center rounded-element px-2 text-center text-13 font-semibold',
                  audience === a.value && 'bg-surface-container',
                  disabled && 'cursor-not-allowed text-muted-foreground',
                )}
              >
                <input
                  type="radio"
                  name="live-audience"
                  value={a.value}
                  checked={audience === a.value}
                  disabled={disabled}
                  onChange={() => setAudience(a.value)}
                  className="sr-only"
                />
                {a.label}
              </label>
            );
          })}
        </div>
        {!datingAllowed && (
          <p className="text-xs text-muted-foreground">
            {t('people.live.datingOff', 'Dating only needs an intimate profile.')}{' '}
            <LocalizedLink to="/meet/dating/onboarding" className="underline underline-offset-4">
              {t('cruising.presence.createProfile')}
            </LocalizedLink>
          </p>
        )}
      </fieldset>

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-2 text-sm font-semibold">
          {t('people.live.duration', 'For')}
          <select
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="min-h-11 rounded-element border border-input bg-background px-4 text-sm font-normal"
          >
            {DURATIONS.map((m) => (
              <option key={m} value={m}>
                {m < 60
                  ? t('people.live.minutes', '{{count}} min', { count: m })
                  : t('people.live.hours', '{{count}} h', { count: m / 60 })}
              </option>
            ))}
          </select>
        </label>
        <Button
          onClick={() => void start()}
          disabled={busy || loading || (needsCity && !cityId)}
          className="gap-2"
        >
          <Clock3 size={14} aria-hidden />
          {busy || loading
            ? t('people.nearby.locating', 'Locating…')
            : t('people.nearby.goLive', 'Go live')}
        </Button>
      </div>

      {err && <p className="text-13 text-destructive">{t(err[0], err[1])}</p>}

      {needsCity && (
        <div>
          <label htmlFor="live-city" className="text-sm font-medium">
            {t('people.live.cityFallback', 'Or pick a city instead (city-level only)')}
          </label>
          <Input
            id="live-city"
            className="mt-2"
            value={citySearch}
            onChange={(event) => setCitySearch(event.target.value)}
            placeholder={t('cruising.presence.cityPlaceholder')}
          />
          <div className="mt-2 max-h-40 space-y-1 overflow-y-auto bg-background p-1">
            {citiesLoading ? (
              <p className="py-4 text-13 text-muted-foreground">
                {t('cruising.presence.cityLoading')}
              </p>
            ) : (
              cities.map((city) => (
                <button
                  type="button"
                  key={city.id}
                  onClick={() => setCityId(city.id)}
                  aria-pressed={cityId === city.id}
                  className={cn(
                    'flex w-full items-center gap-2 px-4 py-4 text-left text-sm transition-colors',
                    cityId === city.id ? 'bg-surface-container font-bold' : 'hover:bg-muted',
                  )}
                >
                  <MapPin size={14} aria-hidden />
                  <span>{city.name}</span>
                  {city.region_name ? (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {city.region_name}
                    </span>
                  ) : null}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      <Dialog open={ackOpen} onOpenChange={setAckOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('people.live.ackTitle', 'Before you go live for dating')}</DialogTitle>
            <DialogDescription>{t('cruising.presence.dialogDescription')}</DialogDescription>
          </DialogHeader>
          <label
            htmlFor="live-safety-acknowledgement"
            className="flex min-h-12 cursor-pointer items-start gap-4 text-sm leading-relaxed"
          >
            <Checkbox
              id="live-safety-acknowledgement"
              checked={acknowledged}
              onCheckedChange={(value) => setAcknowledged(value === true)}
              className="mt-1"
            />
            <span>
              {t(
                'people.live.acknowledgement',
                'I understand that visibility is approximate, turns off on its own, and does not replace checking consent, surroundings, or local law.',
              )}
            </span>
          </label>
          <DialogFooter>
            <Button variant="soft" onClick={() => setAckOpen(false)}>
              {t('cruising.presence.cancel')}
            </Button>
            <Button onClick={() => void start(true)} disabled={!acknowledged || busy}>
              {t('people.nearby.goLive', 'Go live')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
