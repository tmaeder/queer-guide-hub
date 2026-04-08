import { useState } from 'react';
import { useNavigate } from 'react-router';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import AvatarGroup from '@mui/material/AvatarGroup';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { MoreVertical, Calendar, Luggage } from 'lucide-react';
import { format } from 'date-fns';
import { Card, CardImage, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { Trip, TripMember } from '@/hooks/useTrips';
import { useTripMutations } from '@/hooks/useTrips';

interface Props {
  trip: Trip & { member_count: number; trip_members?: TripMember[] };
}

export function TripCard({ trip }: Props) {
  const navigate = useNavigate();
  const { deleteTrip } = useTripMutations();
  const { toast } = useToast();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const dateRange =
    trip.start_date && trip.end_date
      ? `${format(new Date(trip.start_date), 'MMM d')} - ${format(new Date(trip.end_date), 'MMM d, yyyy')}`
      : trip.start_date
        ? `From ${format(new Date(trip.start_date), 'MMM d, yyyy')}`
        : 'No dates set';

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
        toast({ title: 'Trip deleted', description: `"${trip.title}" has been removed.` });
        setDeleteOpen(false);
      },
      onError: (err) => {
        toast({ title: 'Error', description: err.message, variant: 'destructive' });
        setDeleteOpen(false);
      },
    });
  };

  const members = trip.trip_members || [];

  return (
    <>
      <Card hoverable onClick={() => navigate(`/trips/${trip.id}`)}>
        <CardImage
          src={trip.cover_image_url}
          alt={trip.title}
          height={180}
          fallbackIcon={Luggage}
        >
          <IconButton
            size="small"
            onClick={handleMenuClick}
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
              fontWeight: 600,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              mb: 1,
            }}
          >
            {trip.title}
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <Calendar style={{ width: 14, height: 14, flexShrink: 0, color: 'inherit', opacity: 0.6 }} />
            <Typography variant="body2" color="text.secondary">
              {dateRange}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {trip.status === 'planning' && (
                <Badge variant="outline">Planning</Badge>
              )}
              {trip.status === 'active' && (
                <Badge variant="default" sx={{ bgcolor: 'success.main', color: 'success.contrastText' }}>
                  Active
                </Badge>
              )}
              {trip.status === 'completed' && (
                <Badge variant="secondary">Completed</Badge>
              )}
              {trip.status === 'archived' && (
                <Badge variant="outline">Archived</Badge>
              )}
            </Box>

            {members.length > 1 && (
              <AvatarGroup max={4} sx={{ '& .MuiAvatar-root': { width: 28, height: 28, fontSize: '0.75rem' } }}>
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
                {trip.member_count} members
              </Typography>
            )}
          </Box>
        </CardContent>
      </Card>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={(e: React.SyntheticEvent) => { e.stopPropagation?.(); setAnchorEl(null); }}
        onClick={(e) => e.stopPropagation()}
      >
        <MenuItem onClick={handleEdit}>Edit</MenuItem>
        <MenuItem onClick={handleDeleteClick} sx={{ color: 'error.main' }}>
          Delete
        </MenuItem>
      </Menu>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Trip</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{trip.title}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleteTrip.isPending}
            >
              {deleteTrip.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
