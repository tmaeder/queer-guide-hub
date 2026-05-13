import { useMemo, useState } from 'react';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { Loader2, CalendarDays, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useTripMutations } from '@/hooks/useTrips';
import {
  CityCountryAutocomplete,
  type GeoSelection,
} from '@/components/trips/create/CityCountryAutocomplete';
import { trackTripEvent } from '@/utils/tripTracking';

const currencies = [
  { value: 'EUR', label: 'EUR – Euro' },
  { value: 'USD', label: 'USD – US Dollar' },
  { value: 'GBP', label: 'GBP – British Pound' },
  { value: 'CHF', label: 'CHF – Swiss Franc' },
  { value: 'CAD', label: 'CAD – Canadian Dollar' },
  { value: 'AUD', label: 'AUD – Australian Dollar' },
  { value: 'JPY', label: 'JPY – Japanese Yen' },
  { value: 'THB', label: 'THB – Thai Baht' },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CreateTripDialog({ open, onClose }: Props) {
  const { t, ready } = useTranslation();
  const navigate = useLocalizedNavigate();
  const { createTrip } = useTripMutations();
  const { toast } = useToast();
  const [geo, setGeo] = useState<GeoSelection | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currency, setCurrency] = useState('EUR');

  const dateError = useMemo(() => {
    if (startDate && endDate && endDate < startDate) {
      return t('trips.dialog.create.endBeforeStart');
    }
    return null;
  }, [startDate, endDate, t]);

  const canSubmit = Boolean(geo) && !dateError && !createTrip.isPending;

  const resetForm = () => {
    setGeo(null);
    setTitle('');
    setDescription('');
    setStartDate('');
    setEndDate('');
    setCurrency('EUR');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!geo || dateError) return;

    const resolvedTitle =
      title.trim() ||
      t('trips.dialog.create.defaultTitle', { city: geo.cityName });

    try {
      const trip = await createTrip.mutateAsync({
        title: resolvedTitle,
        description: description.trim() || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        currency,
        primary_city_id: geo.cityId,
        primary_country_id: geo.countryId,
        primary_city_name: geo.cityName,
        primary_country_code: geo.countryCode ?? undefined,
        timezone: geo.timezone ?? undefined,
      });
      trackTripEvent('trip_created', {
        trip_id: trip.id,
        city_id: geo.cityId,
        country_code: geo.countryCode,
        has_dates: Boolean(startDate && endDate),
      });
      trackTripEvent('trip_geo_set', {
        trip_id: trip.id,
        city_id: geo.cityId,
        country_code: geo.countryCode,
      });
      toast({
        title: t('trips.toast.created'),
        description: t('trips.toast.createdDescription'),
      });
      handleClose();
      navigate(`/trips/${trip.id}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t('trips.dialog.create.failed');
      toast({
        title: t('trips.toast.error'),
        description: message,
        variant: 'destructive',
      });
    }
  };

  const hasDates = Boolean(startDate && endDate);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent
        data-testid="create-trip-dialog"
      >
        {open && !ready ? (
          <div className="flex items-center justify-center min-h-80">
            <Loader2 className="animate-spin" size={24} />
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold tracking-tight text-balance">{t('trips.dialog.create.title')}</DialogTitle>
              <DialogDescription className="text-sm md:text-base mt-1">
                {t('trips.dialog.create.description')}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-5 mt-6">
              {/* 1) City + Country — REQUIRED, anchors everything downstream */}
              <CityCountryAutocomplete
                value={geo}
                onChange={setGeo}
                required
                autoFocus
                label={t('trips.dialog.create.cityCountryLabel')}
              />

              {/* 2) Dates — optional, but heavily promoted */}
              <div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="trip-start-date">
                      {t('trips.dialog.create.startDate')}
                    </Label>
                    <Input
                      id="trip-start-date"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="trip-end-date">
                      {t('trips.dialog.create.endDate')}
                    </Label>
                    <Input
                      id="trip-end-date"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      min={startDate || undefined}
                      aria-invalid={Boolean(dateError)}
                    />
                    {dateError && (
                      <p className="text-xs text-destructive">{dateError}</p>
                    )}
                  </div>
                </div>
                {!hasDates && (
                  <div className="mt-2 flex items-center gap-1.5 text-muted-foreground text-xs">
                    <Sparkles size={13} />
                    <span className="leading-snug">
                      {t('trips.dialog.create.datesUnlockHint')}
                    </span>
                  </div>
                )}
              </div>

              {/* 3) Title — optional, defaults to "Trip to {city}" */}
              <div className="space-y-1.5">
                <Label htmlFor="trip-title">
                  {t('trips.dialog.create.titleField')}
                </Label>
                <div className="relative">
                  <CalendarDays
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                  />
                  <Input
                    id="trip-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="pl-9"
                    placeholder={
                      geo
                        ? t('trips.dialog.create.defaultTitle', { city: geo.cityName })
                        : t('trips.dialog.create.titlePlaceholder')
                    }
                  />
                </div>
              </div>

              {/* 4) Description */}
              <div className="space-y-1.5">
                <Label htmlFor="trip-description">
                  {t('trips.dialog.create.descriptionField')}
                </Label>
                <Textarea
                  id="trip-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder={t('trips.dialog.create.descriptionPlaceholder')}
                />
              </div>

              {/* 5) Currency */}
              <div className="space-y-1.5">
                <Label htmlFor="trip-currency">
                  {t('trips.dialog.create.currency')}
                </Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger id="trip-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {currencies.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" type="button" onClick={handleClose}>
                {t('trips.dialog.create.cancel')}
              </Button>
              <Button type="submit" variant="brand" disabled={!canSubmit}>
                {createTrip.isPending && (
                  <Loader2 className="animate-spin mr-1" size={16} />
                )}
                {t('trips.dialog.create.submit')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
