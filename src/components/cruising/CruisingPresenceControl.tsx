import { useEffect, useState } from 'react';
import { Clock3, Eye, EyeOff, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
import { useToast } from '@/hooks/use-toast';
import { useMyIntimateProfile } from '@/hooks/useIntimateProfile';
import { useMyCruisingMode, useSetCruisingPresence } from '@/hooks/useCruisingGuide';
import { useOptimizedCities } from '@/hooks/usePlaces';
import { LocalizedLink } from '@/components/routing/LocalizedLink';

export function CruisingPresenceControl() {
  const { t } = useTranslation();
  const { data: profile } = useMyIntimateProfile();
  const { data: mode } = useMyCruisingMode(true);
  const setPresence = useSetCruisingPresence();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [citySearch, setCitySearch] = useState('');
  const [cityId, setCityId] = useState<string | null>(profile?.discovery_city_id ?? null);
  const [now, setNow] = useState(Date.now);
  const { cities, loading: citiesLoading } = useOptimizedCities({
    search: citySearch,
    limit: 8,
    enabled: open,
  });

  const effectiveCityId = cityId ?? profile?.discovery_city_id ?? null;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const active = !!mode?.expires_at && new Date(mode.expires_at).getTime() > now;
  const expiry =
    active && mode?.expires_at
      ? new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(
          new Date(mode.expires_at),
        )
      : null;

  if (!profile?.opted_in_at) {
    return (
      <div className="bg-surface-container p-4">
        <p className="text-sm font-semibold">{t('cruising.presence.peopleOffTitle')}</p>
        <p className="mt-1 text-13 text-muted-foreground">{t('cruising.presence.peopleOffBody')}</p>
        <Button asChild size="sm" className="mt-4">
          <LocalizedLink to="/intimate/onboard">
            {t('cruising.presence.createProfile')}
          </LocalizedLink>
        </Button>
      </div>
    );
  }

  const disable = async () => {
    try {
      await setPresence.mutateAsync({ enabled: false });
      toast({ title: t('cruising.presence.toastDisabled') });
    } catch (error) {
      toast({
        title: t('cruising.presence.toastError'),
        description: String(error),
        variant: 'destructive',
      });
    }
  };

  const enable = async () => {
    if (!effectiveCityId) return;
    try {
      await setPresence.mutateAsync({
        enabled: true,
        cityId: effectiveCityId,
        safetyAcknowledged: acknowledged,
      });
      setOpen(false);
      setAcknowledged(false);
      toast({
        title: t('cruising.presence.toastEnabled'),
        description: t('cruising.presence.toastEnabledBody'),
      });
    } catch (error) {
      toast({
        title: t('cruising.presence.toastError'),
        description: String(error),
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="bg-surface-container p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold">
            {active ? <Eye size={15} aria-hidden /> : <EyeOff size={15} aria-hidden />}
            {active ? t('cruising.presence.visibleTitle') : t('cruising.presence.hiddenTitle')}
          </p>
          <p className="mt-1 text-13 text-muted-foreground">
            {active
              ? t('cruising.presence.expires', { time: expiry })
              : t('cruising.presence.preciseNeverPublished')}
          </p>
        </div>
        {active ? (
          <Button variant="outline" size="sm" onClick={disable} disabled={setPresence.isPending}>
            {t('cruising.presence.turnOff')}
          </Button>
        ) : (
          <Button size="sm" onClick={() => setOpen(true)}>
            {t('cruising.presence.goVisible')}
          </Button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('cruising.presence.dialogTitle')}</DialogTitle>
            <DialogDescription>{t('cruising.presence.dialogDescription')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label htmlFor="cruising-city" className="text-sm font-medium">
                {t('cruising.presence.cityLabel')}
              </label>
              <Input
                id="cruising-city"
                className="mt-2"
                value={citySearch}
                onChange={(event) => setCitySearch(event.target.value)}
                placeholder={t('cruising.presence.cityPlaceholder')}
              />
              <div className="mt-2 max-h-40 space-y-1 overflow-y-auto bg-surface-container p-1">
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
                      className={`flex w-full items-center gap-2 px-3 py-4 text-left text-sm transition-colors ${
                        effectiveCityId === city.id
                          ? 'bg-background font-bold'
                          : 'hover:bg-muted'
                      }`}
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

            <label
              htmlFor="cruising-safety-acknowledgement"
              className="flex min-h-12 cursor-pointer items-start gap-4 text-sm leading-relaxed"
            >
              <Checkbox
                id="cruising-safety-acknowledgement"
                checked={acknowledged}
                onCheckedChange={(value) => setAcknowledged(value === true)}
                className="mt-1"
              />
              <span>{t('cruising.presence.acknowledgement')}</span>
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t('cruising.presence.cancel')}
            </Button>
            <Button
              onClick={enable}
              disabled={!effectiveCityId || !acknowledged || setPresence.isPending}
              className="gap-2"
            >
              <Clock3 size={14} aria-hidden />
              {setPresence.isPending
                ? t('cruising.presence.enabling')
                : t('cruising.presence.enable')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
