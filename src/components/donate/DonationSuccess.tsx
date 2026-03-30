import { useTranslation } from 'react-i18next';
import { CheckCircle, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export function DonationSuccess() {
  const { t } = useTranslation();

  return (
    <Card>
      <CardContent className="py-8 text-center space-y-4">
        <CheckCircle
          style={{ width: 48, height: 48, margin: '0 auto', color: 'var(--color-green-500, #22c55e)' }}
        />
        <Typography variant="h5" fontWeight={700}>
          {t('donate.thankYou', 'Thank you!')}
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 400, mx: 'auto' }}>
          {t(
            'donate.successMessage',
            'Your donation helps keep queer.guide free and accessible for the LGBTQ+ community worldwide.'
          )}
        </Typography>
        <Box sx={{ pt: 2, display: 'flex', justifyContent: 'center', gap: 2 }}>
          <Button variant="outline" asChild>
            <Link to="/">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('donate.backHome', 'Back to home')}
            </Link>
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}
