import { useState, type KeyboardEvent } from 'react';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import AvatarGroup from '@mui/material/AvatarGroup';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { MoreVertical, Calendar, Luggage, MapPin, ShieldCheck, ShieldAlert, AlertTriangle } from 'lucide-react';
import Tooltip from '@mui/material/Tooltip';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { Card, CardImage, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import type { Trip, TripMember } from '@/hooks/useTrips';
import { useTripMutations } from '@/hooks/useTrips';

interface Props {
  trip: Trip & {
    member_count: number;
    place_count?: number;
    day_count?: number;
    /** Minimum equality score across countries on the trip (null if unknown). */
    min_equality_score?: number | null;
    trip_members?: TripMember[];
  };
}

type SafetyLevel = 'safe' | 'caution' | 'danger';

function safetyLevelFromScore(score: number | null | undefined): SafetyLevel | null {
  if (score == null) return null;
  if (score >= 70) return 'safe';
  if (score >= 40) return 'caution';
  return 'danger';
}

export function TripCard({ trip }: Props) {
  const { t } = useTranslation();
  const navigate = useLocalizedNavigate();
  const { deleteTrip } = useTripMutations();
  const { toast } = useToast();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const dateRange =
    trip.start_date && trip.end_date
      ? `${format(new Date(trip.start_date), 'MMM d')} – ${format(
          new Date(trip.end_date),
          'MMM d, yyyy',
        )}`
      : trip.start_date
        ? t('trips.card.fromDate', {
            date: format(new Date(trip.start_date), 'MMM d, yyyy'),
          })
        : t('trips.card.noDates');

  const placeCount = trip.place_count ?? 0;
  const dayCount = trip.day_count ?? 0;
  const safetyLevel = safetyLevelFromScore(trip.min_equality_score);

  const isActiveToday = (() => {
    if (!trip.start_date || !trip.end_date) return false;
    const now = new Date();
    const start = new Date(trip.start_date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(trip.end_date);
    end.setHours(23, 59, 59, 999);
    return now >= start && now <= end;
  })();

  const handleNavigate = () => navigate(`/trips/${trip.id}`);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleNavigate();
    }
  };

  const handleMenuClick = (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    setAnchorEl(e.currentTarget);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setAnchorEl(null);
    navigate(`/trips/${trip.id}`);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setAnchorEl(null);
    setDeleteOpen(true);
  };

  const handleConfirmDelete = () => {
    deleteTrip.mutate(trip.id, {
      onSuccess: () => {
        toast({
          title: t('trips.toast.deleted'),
          description: t('trips.toast.deletedDescription', { title: trip.title }),
        });
        setDeleteOpen(false);
      },
      onError: (err) => {
        toast({
          title: t('trips.toast.error'),
          description: err.message,
          variant: 'destructive',
        });
        setDeleteOpen(false);
      },
    });
  };

  const members = trip.trip_members || [];

  const statusConfig: Record<
    Trip['status'],
    { label: string; variant: 'default' | 'secondary' | 'outline'; brand?: boolean }
  > = {
    planning: { label: t('trips.status.planning'), variant: 'outline' },
    active: { label: t('trips.status.active'), variant: 'default', brand: true },
    completed: { label: t('trips.status.completed'), variant: 'secondary' },
    archived: { label: t('trips.status.archived'), variant: 'outline' },
  };

  const status = statusConfig[trip.status];

  return (
    <>
      <Card
        hoverable
        role="link"
        tabIndex={0}
        aria-label={t('trips.card.ariaLabel', { title: trip.title })}
        onClick={handleNavigate}
        onKeyDown={handleKeyDown}

      >
        <CardImage
          src={trip.cover_image_url}
          alt={trip.title}
          height={180}
          fallbackIcon={Luggage}
        >
          {safetyLevel && (
            <Tooltip
              title={t(`trips.card.safety.${safetyLevel}`)}
              arrow
              placement="top"
            >
              <Box
                component="span"
                aria-label={t(`trips.card.safety.${safetyLevel}`)}
                sx={{
                  position: 'absolute',
                  top: 8,
                  left: 8,
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor:
                    safetyLevel === 'safe'
                      ? 'success.main'
                      : safetyLevel === 'caution'
                        ? 'warning.main'
                        : 'error.main',
                  color: 'common.white',
                  boxShadow: 1,
                  cursor: 'help',
                }}
              >
                {safetyLevel === 'safe' && (
                  <ShieldCheck style={{ width: 16, height: 16 }} />
                )}
                {safetyLevel === 'caution' && (
                  <ShieldAlert style={{ width: 16, height: 16 }} />
                )}
                {safetyLevel === 'danger' && (
                  <AlertTriangle style={{ width: 16, height: 16 }} />
                )}
              </Box>
            </Tooltip>
          )}
          <IconButton
            className="trip-card-menu"
            size="small"
            onClick={handleMenuClick}
            aria-label={t('trips.card.menuAria')}
            sx={{
              position: 'absolute',
              top: 8,
              right: 8,
              bgcolor: 'background.paper',
              boxShadow: 1,
              '&:hover': { bgcolor: 'background.paper' },
            }}
          >
            <MoreVertical style={{ width: 16, height: 16 }} />
          </IconButton>
        </CardImage>

        <CardContent>
          <Typography
            variant="subtitle1"
            sx={{
              fontWeight: 700,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              mb: 1,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              letterSpacing: '-0.01em',
            }}
          >
            {trip.title}
          </Typography>

          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.25,
              mb: 1.5,
              flexWrap: 'wrap',
              color: 'text.secondary',
            }}
          >
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
              <Calendar
                style={{ width: 14, height: 14, flexShrink: 0, opacity: 0.7 }}
              />
              <Typography variant="caption" sx={{ fontSize: '0.8125rem' }}>
                {dateRange}
              </Typography>
            </Box>
            {isActiveToday && (
              <Box
                component="button"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/trips/${trip.id}/today`);
                }}
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.5,
                  px: 0.75,
                  py: 0.25,
                  bgcolor: 'brand.main',
                  color: 'brand.contrastText',
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
                aria-label={t('trips.card.viewToday', 'View today')}
              >
                <Box
                  component="span"
                  sx={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    bgcolor: 'currentColor',
                    opacity: 0.9,
                  }}
                />
                {t('trips.card.activeToday', 'Active · Today')}
              </Box>
            )}
            {(placeCount > 0 || dayCount > 0) && (
              <Box
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.5,
                }}
              >
                <Box
                  component="span"
                  sx={{
                    width: 3,
                    height: 3,
                    borderRadius: '50%',
                    bgcolor: 'text.disabled',
                  }}
                />
                <MapPin
                  style={{ width: 13, height: 13, flexShrink: 0, opacity: 0.7 }}
                />
                <Typography variant="caption" sx={{ fontSize: '0.8125rem' }}>
                  {t('trips.card.placeCount', { count: placeCount })}
                  {dayCount > 0 &&
                    ` · ${t('trips.card.dayCount', { count: dayCount })}`}
                </Typography>
              </Box>
            )}
          </Box>

          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
            }}
          >
            <Badge
              variant={status.variant}
              {...(status.brand && {
                sx: {
                  bgcolor: 'brand.main',
                  color: 'brand.contrastText',
                  borderColor: 'brand.main',
                },
              })}
            >
              {status.label}
            </Badge>

            {members.length > 1 && (
              <AvatarGroup
                max={4}
                sx={{
                  '& .MuiAvatar-root': {
                    width: 28,
                    height: 28,
                    fontSize: '0.75rem',
                  },
                }}
              >
                {members.map((m) => (
                  <Avatar
                    key={m.id}
                    alt={m.profiles?.display_name || 'Member'}
                    src={m.profiles?.avatar_url || undefined}
                  >
                    {(m.profiles?.display_name || 'U')[0].toUpperCase()}
                  </Avatar>
                ))}
              </AvatarGroup>
            )}
            {!members.length && trip.member_count > 1 && (
              <Typography variant="caption" color="text.secondary">
                {t('trips.card.memberCount', { count: trip.member_count })}
              </Typography>
            )}
          </Box>
        </CardContent>
      </Card>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={(e: React.SyntheticEvent) => {
          e.stopPropagation?.();
          setAnchorEl(null);
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <MenuItem onClick={handleEdit}>{t('trips.card.edit')}</MenuItem>
        <MenuItem onClick={handleDeleteClick} sx={{ color: 'error.main' }}>
          {t('trips.card.delete')}
        </MenuItem>
      </Menu>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('trips.card.deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('trips.card.deleteConfirm', { title: trip.title })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              {t('trips.card.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleteTrip.isPending}
            >
              {deleteTrip.isPending
                ? t('trips.card.deleting')
                : t('trips.card.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
