import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Calendar, MapPin, Music } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardImage } from '@/components/ui/card';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
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
    <LocalizedLink to={`/festivals/${festival.id}`} style={{ textDecoration: 'none' }}>
      <Card hoverable>
        <CardImage
          src={heroImage}
          alt={festival.name}
          fallbackIcon={Music}
          height={160}
        />
        <Box sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Typography variant="subtitle1" fontWeight={700} noWrap sx={{ flex: 1 }}>
              {festival.name}
            </Typography>
            {festival.featured && (
              <Badge style={{ backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}>Featured</Badge>
            )}
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
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {festival.description}
            </Typography>
          )}
        </Box>
      </Card>
    </LocalizedLink>
  );
}
