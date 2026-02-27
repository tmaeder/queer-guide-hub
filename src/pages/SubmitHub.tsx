import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, MapPin, ArrowLeft } from 'lucide-react';

const contentTypes = [
  {
    type: 'venue',
    label: 'Venue',
    description: 'Share a queer-friendly bar, club, cafe, or community space.',
    icon: MapPin,
  },
  {
    type: 'event',
    label: 'Event',
    description: 'Submit an upcoming LGBTQ+ event, party, or gathering.',
    icon: Calendar,
  },
] as const;

const SubmitHub = () => {
  const navigate = useNavigate();

  return (
    <Box sx={{ maxWidth: '40rem', mx: 'auto', py: 4, px: 2 }}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate(-1)}
        style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}
      >
        <ArrowLeft style={{ width: 16, height: 16 }} />
        Back
      </Button>

      <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
        Submit Content
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Help grow the community by sharing LGBTQ+ venues and events. All submissions are reviewed before publishing.
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {contentTypes.map(({ type, label, description, icon: Icon }) => (
          <Card
            key={type}
            style={{ cursor: 'pointer' }}
            onClick={() => navigate(`/submit/${type}`)}
          >
            <CardContent sx={{ p: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: '12px',
                  bgcolor: 'action.hover',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Icon style={{ width: 24, height: 24 }} />
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  {label}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {description}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        ))}
      </Box>
    </Box>
  );
};

export default SubmitHub;
