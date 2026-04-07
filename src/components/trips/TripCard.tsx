import { useState } from 'react';
import { useNavigate } from 'react-router';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Box from '@mui/material/Box';
import { MoreVertical, Users, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import type { Trip } from '@/hooks/useTrips';
import { useTripMutations } from '@/hooks/useTrips';

const statusColors: Record<string, 'default' | 'primary' | 'success' | 'warning'> = {
  planning: 'primary',
  active: 'success',
  completed: 'default',
  archived: 'warning',
};

const gradients = [
  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
];

interface Props {
  trip: Trip & { member_count: number };
}

export function TripCard({ trip }: Props) {
  const navigate = useNavigate();
  const { deleteTrip } = useTripMutations();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const gradient = gradients[trip.title.length % gradients.length];
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

  const handleDelete = () => {
    setAnchorEl(null);
    if (confirm('Delete this trip? This cannot be undone.')) {
      deleteTrip.mutate(trip.id);
    }
  };

  return (
    <Card variant="outlined" sx={{ position: 'relative', overflow: 'hidden' }}>
      <CardActionArea onClick={() => navigate(`/trips/${trip.id}`)}>
        <Box
          sx={{
            height: 120,
            background: trip.cover_image_url
              ? `url(${trip.cover_image_url}) center/cover`
              : gradient,
          }}
        />
        <CardContent>
          <Typography variant="subtitle1" fontWeight={600} noWrap>
            {trip.title}
          </Typography>
          <Box className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
            <Calendar size={14} />
            <Typography variant="body2" color="text.secondary">
              {dateRange}
            </Typography>
          </Box>
          <Box className="flex items-center gap-2 mt-2">
            <Chip
              label={trip.status}
              size="small"
              color={statusColors[trip.status] || 'default'}
              variant="outlined"
            />
            {trip.member_count > 1 && (
              <Box className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users size={14} />
                {trip.member_count}
              </Box>
            )}
          </Box>
        </CardContent>
      </CardActionArea>

      <IconButton
        size="small"
        onClick={handleMenuClick}
        sx={{ position: 'absolute', top: 8, right: 8, bgcolor: 'rgba(255,255,255,0.85)', '&:hover': { bgcolor: 'rgba(255,255,255,0.95)' } }}
      >
        <MoreVertical size={16} />
      </IconButton>

      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
        <MenuItem onClick={() => { setAnchorEl(null); navigate(`/trips/${trip.id}`); }}>
          Edit
        </MenuItem>
        <MenuItem onClick={handleDelete} sx={{ color: 'error.main' }}>
          Delete
        </MenuItem>
      </Menu>
    </Card>
  );
}
