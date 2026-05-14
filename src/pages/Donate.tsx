import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Heart } from 'lucide-react';
import { DonationForm } from '@/components/donate/DonationForm';
import { DonorWall } from '@/components/donate/DonorWall';
import { DonationSuccess } from '@/components/donate/DonationSuccess';

export default function Donate() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const status = searchParams.get('status');

  return (
    <div className="container mx-auto py-8 sm:py-12">
      <div className="text-center mb-10">
        <div className="w-14 h-14 rounded-full bg-muted/40 flex items-center justify-center mx-auto mb-4">
          <Heart className="w-7 h-7" />
        </div>
        <h4 className="text-3xl font-bold mb-2">
          {t('donate.title', 'Support queer.guide')}
        </h4>
        <p className="text-base text-muted-foreground mx-auto leading-relaxed">
          {t(
            'donate.subtitle',
            'queer.guide is a free platform connecting the LGBTQ+ community with safe spaces, events, and resources worldwide. Your donation helps us keep it running and accessible to everyone.'
          )}
        </p>
      </div>

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
