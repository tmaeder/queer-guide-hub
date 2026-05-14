import { useTranslation } from 'react-i18next';
import { Heart } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useDonorWall } from '@/hooks/useDonations';
import { formatCents } from '@/lib/currency';
import { timeAgo } from '@/utils/timezone';

export function DonorWall() {
  const { t } = useTranslation();
  const { data: donors, isLoading } = useDonorWall(30);

  if (isLoading) {
    return (
      <div className="py-6 text-center">
        <p className="text-sm text-muted-foreground">
          {t('donate.loadingDonors', 'Loading donors...')}
        </p>
      </div>
    );
  }

  if (!donors?.length) {
    return (
      <div className="py-8 text-center">
        <Heart style={{ width: 32, height: 32, margin: '0 auto 8px', opacity: 0.3 }} />
        <p className="text-sm text-muted-foreground">
          {t('donate.noDonorsYet', 'Be the first to support queer.guide!')}
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {donors.map((donor) => (
        <Card key={donor.id}>
          <CardContent className="py-3 px-4 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium truncate">
                  {donor.donor_name || t('donate.anonymousDonor', 'A supporter')}
                </p>
                {donor.donation_type === 'recurring' && (
                  <Badge variant="secondary" className="text-xs">
                    {t('donate.recurring', 'Recurring')}
                  </Badge>
                )}
              </div>
              {donor.message && (
                <p className="text-sm text-muted-foreground truncate">{donor.message}</p>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-medium">{formatCents(donor.amount, donor.currency)}</p>
              <p className="text-xs text-muted-foreground">{timeAgo(donor.created_at)}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
