import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Activity, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

const GYG_PARTNER_ID = '2PBDXWH';

interface ActivitiesWidgetProps {
  destination: string;
  countryCode?: string;
}

export function ActivitiesWidget({ destination }: ActivitiesWidgetProps) {
  const searchUrl = `https://www.getyourguide.com/s/?q=${encodeURIComponent(destination + ' LGBTQ')}&partner_id=${GYG_PARTNER_ID}`;

  return (
    <Box
      sx={{
        textAlign: 'center',
        py: 6,
        px: 3,
        bgcolor: 'action.hover',
        borderRadius: 2,
        border: '2px dashed',
        borderColor: 'divider',
      }}
    >
      <Box
        sx={{
          p: 2,
          bgcolor: 'rgba(var(--muted-rgb, 128, 128, 128), 0.15)',
          borderRadius: '50%',
          width: 64,
          height: 64,
          mx: 'auto',
          mb: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Activity style={{ height: 32, width: 32, color: 'var(--muted-foreground)' }} />
      </Box>
      <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
        Tours & Activities
      </Typography>
      <Typography sx={{ color: 'text.secondary', mb: 2, maxWidth: 400, mx: 'auto' }}>
        Discover amazing experiences in {destination}. Browse tours, activities, and attractions.
      </Typography>
      <Button
        variant="outline"
        size="sm"
        onClick={() => window.open(searchUrl, '_blank', 'noopener,noreferrer')}
      >
        <ExternalLink style={{ height: 14, width: 14, marginRight: 6 }} />
        Browse Tours on GetYourGuide
      </Button>
    </Box>
  );
}
