import { useTranslation } from 'react-i18next';
import { CheckCircle, ArrowLeft } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export function DonationSuccess() {
  const { t } = useTranslation();

  return (
    <Card>
      <CardContent className="py-8 text-center space-y-4">
        <CheckCircle className="w-12 h-12 mx-auto text-green-500" />
        <h5 className="text-xl font-bold">
          {t('donate.thankYou', 'Thank you!')}
        </h5>
        <p className="text-base text-muted-foreground max-w-md mx-auto">
          {t(
            'donate.successMessage',
            'Your donation helps keep queer.guide free and accessible for the LGBTQ+ community worldwide.'
          )}
        </p>
        <div className="pt-4 flex justify-center gap-4">
          <Button variant="outline" asChild>
            <LocalizedLink to="/">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('donate.backHome', 'Back to home')}
            </LocalizedLink>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
