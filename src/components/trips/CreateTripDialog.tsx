import { forwardRef, useMemo, useState } from 'react';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import MuiDialog from '@mui/material/Dialog';
import MuiDialogContent from '@mui/material/DialogContent';
import IconButton from '@mui/material/IconButton';
import Slide from '@mui/material/Slide';
import useMediaQuery from '@mui/material/useMediaQuery';
import type { TransitionProps } from '@mui/material/transitions';
import { useTheme } from '@mui/material/styles';
import { CalendarDays, Sparkles, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
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

const SlideUp = forwardRef<
  unknown,
  TransitionProps & { children: React.ReactElement<unknown, string> }
>(function SlideUp(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />;
});

interface Props {
  open: boolean;
  onClose: () => void;
}

function ResponsiveDialogShell({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  return (
    <MuiDialog
      open={open}
      onClose={onClose}
      fullScreen={isMobile}
      maxWidth="sm"
      fullWidth
      TransitionComponent={isMobile ? SlideUp : undefined}
      PaperProps={{
        sx: isMobile
          ? {
              borderRadius: 0,
              m: 0,
              width: '100%',
              maxHeight: '100dvh',
              height: '100dvh',
              display: 'flex',
              flexDirection: 'column',
            }
          : { borderRadius: 0 },
      }}
      data-testid="create-trip-dialog"
      data-mobile={isMobile ? 'true' : 'false'}
    >
      <MuiDialogContent
        sx={{
          p: { xs: 2, sm: 3 },
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          flex: isMobile ? 1 : 'initial',
        }}
      >
        {children}
      </MuiDialogContent>
      <IconButton
        aria-label="Close"
        onClick={onClose}
        sx={{ position: 'absolute', right: 8, top: 8, color: 'text.secondary' }}
        size="small"
      >
        <X style={{ width: 16, height: 16 }} />
      </IconButton>
    </MuiDialog>
  );
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

  // Guard against raw i18n key flashes: don't render the form until
  // translations are ready. Resources are bundled sync so this normally
  // resolves on the very first render, but the ready-check protects against
  // any late-initializing language detection / namespace load.
  if (open && !ready) {
    return (
      <ResponsiveDialogShell open={open} onClose={handleClose}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 320,
          }}
        >
          <CircularProgress size={24} />
        </Box>
      </ResponsiveDialogShell>
    );
  }

  return (
    <ResponsiveDialogShell open={open} onClose={handleClose}>
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
    </ResponsiveDialogShell>
  );
}
