import { useTranslation } from 'react-i18next';
import { Heart } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useDonorWall } from '@/hooks/useDonations';

function formatCurrency(cents: number, currency = 'usd') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
  }).format(cents / 100);
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function DonorWall() {
  const { t } = useTranslation();
  const { data: donors, isLoading } = useDonorWall(30);

  if (isLoading) {
    return (
      <Box sx={{ py: 3, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          {t('donate.loadingDonors', 'Loading donors...')}
        </Typography>
      </Box>
    );
  }

  if (!donors?.length) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Heart
          style={{ width: 32, height: 32, margin: '0 auto 8px', opacity: 0.3 }}
        />
        <Typography variant="body2" color="text.secondary">
          {t('donate.noDonorsYet', 'Be the first to support queer.guide!')}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'grid', gap: 1.5 }}>
      {donors.map((donor) => (
        <Card key={donor.id}>
          <CardContent className="py-3 px-4 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Typography variant="subtitle2" noWrap>
                  {donor.donor_name || t('donate.anonymousDonor', 'A supporter')}
                </Typography>
                {donor.donation_type === 'recurring' && (
                  <Badge variant="secondary" className="text-xs">
                    {t('donate.recurring', 'Recurring')}
                  </Badge>
                )}
              </div>
              {donor.message && (
                <Typography variant="body2" color="text.secondary" noWrap>
                  {donor.message}
                </Typography>
              )}
            </div>
            <div className="text-right shrink-0">
              <Typography variant="subtitle2">
                {formatCurrency(donor.amount, donor.currency)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {timeAgo(donor.created_at)}
              </Typography>
            </div>
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}
