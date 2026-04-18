import { useMemo, useState } from 'react';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import { CalendarDays, Sparkles } from 'lucide-react';
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
  const { t } = useTranslation();
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

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) handleClose();
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t('trips.dialog.create.title')}</DialogTitle>
            <DialogDescription>
              {t('trips.dialog.create.description')}
            </DialogDescription>
          </DialogHeader>

          <Box
            sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 3 }}
          >
            {/* 1) City + Country — REQUIRED, anchors everything downstream */}
            <CityCountryAutocomplete
              value={geo}
              onChange={setGeo}
              required
              autoFocus
              label={t('trips.dialog.create.cityCountryLabel')}
            />

            {/* 2) Dates — optional, but heavily promoted */}
            <Box>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                  gap: 2,
                }}
              >
                <TextField
                  label={t('trips.dialog.create.startDate')}
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                />
                <TextField
                  label={t('trips.dialog.create.endDate')}
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ min: startDate || undefined }}
                  fullWidth
                  error={Boolean(dateError)}
                  helperText={dateError ?? undefined}
                />
              </Box>
              {!hasDates && (
                <Box
                  sx={{
                    mt: 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.75,
                    color: 'text.secondary',
                    fontSize: 12,
                  }}
                >
                  <Sparkles size={13} />
                  <Typography variant="caption" sx={{ lineHeight: 1.3 }}>
                    {t('trips.dialog.create.datesUnlockHint')}
                  </Typography>
                </Box>
              )}
            </Box>

            {/* 3) Title — optional, defaults to "Trip to {city}" */}
            <TextField
              label={t('trips.dialog.create.titleField')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              fullWidth
              placeholder={
                geo
                  ? t('trips.dialog.create.defaultTitle', { city: geo.cityName })
                  : t('trips.dialog.create.titlePlaceholder')
              }
              InputProps={{
                startAdornment: (
                  <Box sx={{ mr: 1, color: 'text.secondary', display: 'flex' }}>
                    <CalendarDays size={16} />
                  </Box>
                ),
              }}
            />

            {/* 4) Description */}
            <TextField
              label={t('trips.dialog.create.descriptionField')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              fullWidth
              multiline
              rows={2}
              placeholder={t('trips.dialog.create.descriptionPlaceholder')}
            />

            {/* 5) Currency */}
            <TextField
              label={t('trips.dialog.create.currency')}
              select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              fullWidth
            >
              {currencies.map((c) => (
                <MenuItem key={c.value} value={c.value}>
                  {c.label}
                </MenuItem>
              ))}
            </TextField>
          </Box>

          <DialogFooter>
            <Button variant="outline" type="button" onClick={handleClose}>
              {t('trips.dialog.create.cancel')}
            </Button>
            <Button type="submit" variant="brand" disabled={!canSubmit}>
              {createTrip.isPending && (
                <CircularProgress
                  size={16}
                  sx={{ mr: 1, color: 'inherit' }}
                />
              )}
              {t('trips.dialog.create.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
