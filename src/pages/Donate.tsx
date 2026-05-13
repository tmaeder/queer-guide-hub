import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Heart } from 'lucide-react';
import { DonationForm } from '@/components/donate/DonationForm';
import { DonorWall } from '@/components/donate/DonorWall';
import { DonationSuccess } from '@/components/donate/DonationSuccess';
import { PageHeader } from '@/components/layout/PageHeader';

export default function Donate() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const status = searchParams.get('status');

  return (
    <div className="container mx-auto py-8 sm:py-12 px-4">
      <PageHeader
        center
        eyebrow={t('donate.eyebrow', 'Community-powered')}
        title={t('donate.title', 'Support queer.guide')}
        subtitle={t(
          'donate.subtitle',
          'queer.guide is a free platform connecting the LGBTQ+ community with safe spaces, events, and resources worldwide. Your donation helps us keep it running and accessible to everyone.'
        )}
      >
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-background shadow-sm">
          <Heart className="w-7 h-7" />
        </div>
      </PageHeader>

      {status === 'success' ? (
        <div className="mx-auto">
          <DonationSuccess />
        </div>
      ) : (
        <>
          <div className="mx-auto mb-12">
            <DonationForm />
          </div>
          <div className="mx-auto">
            <p className="block text-center mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {t('donate.donorWall', 'Recent supporters')}
            </p>
            <DonorWall />
          </div>
        </>
      )}
    </div>
  );
}
