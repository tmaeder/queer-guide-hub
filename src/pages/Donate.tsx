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
    <Container maxWidth="md" sx={{ py: { xs: 4, sm: 6 } }}>
      {/* Hero */}
      <Box sx={{ textAlign: 'center', mb: 5 }}>
        <Box
          sx={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            bgcolor: 'action.hover',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mx: 'auto',
            mb: 2,
          }}
        >
          <Heart style={{ width: 28, height: 28 }} />
        </Box>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          {t('donate.title', 'Support queer.guide')}
        </Typography>
        <Typography
          variant="body1"
          color="text.secondary"
          sx={{ maxWidth: 520, mx: 'auto', lineHeight: 1.7 }}
        >
          {t(
            'donate.subtitle',
            'queer.guide is a free platform connecting the LGBTQ+ community with safe spaces, events, and resources worldwide. Your donation helps us keep it running and accessible to everyone.'
          )}
        </Typography>
      </Box>

      {status === 'success' ? (
        <Box sx={{ maxWidth: 480, mx: 'auto' }}>
          <DonationSuccess />
        </Box>
      ) : (
        <>
          {/* Centered form */}
          <Box sx={{ maxWidth: 480, mx: 'auto', mb: 6 }}>
            <DonationForm />
          </Box>

          {/* Donor wall below */}
          <Box sx={{ maxWidth: 480, mx: 'auto' }}>
            <Typography
              variant="overline"
              color="text.secondary"
              sx={{ display: 'block', textAlign: 'center', mb: 2, letterSpacing: '0.1em' }}
            >
              {t('donate.donorWall', 'Recent supporters')}
            </Typography>
            <DonorWall />
          </Box>
        </>
      )}
    </Container>
  );
}
