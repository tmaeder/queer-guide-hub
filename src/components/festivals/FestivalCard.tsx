import { Link } from 'react-router-dom';
import { Calendar, MapPin, Music } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Chip from '@mui/material/Chip';
import { format } from 'date-fns';
import type { FestivalWithRelations } from '@/hooks/useFestivals';

const TYPE_LABELS: Record<string, string> = {
  festival: 'Festival',
  pride: 'Pride',
  conference: 'Conference',
  series: 'Series',
  other: 'Other',
};

interface FestivalCardProps {
  festival: FestivalWithRelations;
}

export function FestivalCard({ festival }: FestivalCardProps) {
  const location = [festival.cities?.name, festival.countries?.name].filter(Boolean).join(', ');

  const dateRange = (() => {
    if (!festival.start_date) return 'Dates TBA';
    const start = new Date(festival.start_date);
    if (!festival.end_date) return format(start, 'MMM d, yyyy');
    const end = new Date(festival.end_date);
    if (format(start, 'yyyy-MM') === format(end, 'yyyy-MM')) {
      return `${format(start, 'MMM d')} - ${format(end, 'd, yyyy')}`;
    }
    return `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`;
  })();

  const heroImage = festival.images && festival.images.length > 0 ? festival.images[0] : null;

  return (
    <Link to={`/festivals/${festival.id}`} style={{ textDecoration: 'none' }}>
      <Paper
        elevation={0}
        sx={{
          border: 1,
          borderColor: 'divider',
          borderRadius: 2,
          overflow: 'hidden',
          transition: 'box-shadow 0.2s, transform 0.2s',
          '&:hover': { boxShadow: 3, transform: 'translateY(-2px)' },
        }}
      >
        {heroImage && (
          <Box sx={{ height: 160, overflow: 'hidden' }}>
            <img src={heroImage} alt={festival.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </Box>
        )}
        <Box sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Typography variant="subtitle1" fontWeight={700} noWrap sx={{ flex: 1 }}>
              {festival.name}
            </Typography>
            {festival.featured && <Badge style={{ backgroundColor: '#333', color: '#fff' }}>Featured</Badge>}
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
            <Chip
              size="small"
              icon={<Music style={{ width: 12, height: 12 }} />}
              label={TYPE_LABELS[festival.festival_type] || festival.festival_type}
              variant="outlined"
            />
            <Chip
              size="small"
              icon={<Calendar style={{ width: 12, height: 12 }} />}
              label={dateRange}
              variant="outlined"
            />
            {location && (
              <Chip
                size="small"
                icon={<MapPin style={{ width: 12, height: 12 }} />}
                label={location}
                variant="outlined"
              />
            )}
            {festival.is_recurring && (
              <Chip size="small" label="Recurring" color="info" variant="outlined" />
            )}
          </Box>
          {festival.description && (
            <Typography variant="body2" color="text.secondary" sx={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}>
              {festival.description}
            </Typography>
          )}
        </Box>
      </Paper>
    </Link>
  );
}
