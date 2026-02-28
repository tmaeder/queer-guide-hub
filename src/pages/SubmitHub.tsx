import { useNavigate } from 'react-router-dom';
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/PageHeader';
import { Calendar, MapPin } from 'lucide-react';

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
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <PageHeader
        title="Submit Content"
        subtitle="Help grow the community by sharing LGBTQ+ venues and events. All submissions are reviewed before publishing."
        center
      />

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
    </Container>
  );
};

export default SubmitHub;
