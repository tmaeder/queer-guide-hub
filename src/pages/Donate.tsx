import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Heart } from 'lucide-react';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { DonationForm } from '@/components/donate/DonationForm';
import { DonorWall } from '@/components/donate/DonorWall';
import { DonationSuccess } from '@/components/donate/DonationSuccess';

export default function Donate() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const status = searchParams.get('status');

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, sm: 5 } }}>
      {/* Hero */}
      <Box sx={{ textAlign: 'center', mb: 4 }}>
        <Heart style={{ width: 40, height: 40, margin: '0 auto 12px', opacity: 0.8 }} />
        <Typography variant="h4" fontWeight={700} gutterBottom>
          {t('donate.title', 'Support queer.guide')}
        </Typography>
        <Typography
          variant="body1"
          color="text.secondary"
          sx={{ maxWidth: 600, mx: 'auto' }}
        >
          {t(
            'donate.subtitle',
            'queer.guide is a free platform connecting the LGBTQ+ community with safe spaces, events, and resources worldwide. Your donation helps us keep it running and accessible to everyone.'
          )}
        </Typography>
      </Box>

      {status === 'success' ? (
        <Box sx={{ maxWidth: 520, mx: 'auto' }}>
          <DonationSuccess />
        </Box>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
            gap: 4,
            alignItems: 'start',
          }}
        >
          {/* Left: form */}
          <DonationForm />

          {/* Right: donor wall */}
          <Box>
            <Typography variant="h6" fontWeight={600} gutterBottom>
              {t('donate.donorWall', 'Recent supporters')}
            </Typography>
            <DonorWall />
          </Box>
        </Box>
      )}
    </Container>
  );
}
