/**
 * SubmitHub — /submit/ hub page
 * Shows 6 content type cards for community submissions.
 */

import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { submissionTypes } from '@/config/submissionRegistry';
import { ArrowRight, Heart, ArrowLeft, Camera } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const SubmitHub = () => {
  const navigate = useLocalizedNavigate();
  const { user } = useAuth();
  const { t } = useTranslation();

  return (
    <div className="mx-auto py-8 px-4">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate(-1)}
        style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}
      >
        <ArrowLeft style={{ width: 16, height: 16 }} />
        Back
      </Button>

      <div className="text-center mb-8">
        <div className="flex justify-center mb-3">
          <Heart style={{ width: 32, height: 32 }} />
        </div>
        <h4 className="text-2xl font-bold mb-2">
          {t('pages.submit.title', 'Contribute to Queer Guide')}
        </h4>
        <p className="text-base text-muted-foreground max-w-lg mx-auto">
          {t('pages.submit.subtitle', "Help build the world's most comprehensive LGBTQ+ directory. All submissions are reviewed before publishing.")}
        </p>
      </div>

      {!user && (
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground text-center">
              <strong>Tip:</strong>{' '}
              <button
                type="button"
                onClick={() => navigate('/auth')}
                className="text-foreground underline cursor-pointer bg-transparent border-0 p-0 font-inherit"
              >
                Sign in or create an account
              </button>{' '}
              to submit content. Guest submissions are not currently supported.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <Card onClick={() => navigate('/submit/event?mode=scan')}>
          <CardContent>
            <div className="flex items-center gap-4">
              <div
                className="flex items-center justify-center flex-shrink-0 bg-muted"
                style={{ width: 44, height: 44 }}
              >
                <Camera style={{ width: 22, height: 22 }} />
              </div>
              <div>
                <p className="text-base font-semibold mb-0.5">Scan a Flyer</p>
                <p className="text-sm text-muted-foreground">
                  Take a photo of an event flyer or venue card and we'll extract the details
                  automatically.
                </p>
              </div>
              <ArrowRight style={{ width: 18, height: 18, flexShrink: 0 }} />
            </div>
          </CardContent>
        </Card>

        {submissionTypes.map((type) => {
          const Icon = type.icon;
          return (
            <Card key={type.id} onClick={() => navigate(`/submit/${type.id}`)}>
              <CardContent>
                <div
                  className="flex items-center justify-center mb-3"
                  style={{ width: 44, height: 44, backgroundColor: `${type.color}15` }}
                >
                  <Icon style={{ width: 22, height: 22, color: type.color }} />
                </div>
                <p className="text-base font-semibold mb-1">Submit {type.label}</p>
                <p className="text-sm text-muted-foreground mb-3" style={{ minHeight: '2.5em' }}>
                  {type.description}
                </p>
                <div className="flex items-center gap-1">
                  <p className="text-sm font-semibold text-foreground">Get started</p>
                  <ArrowRight style={{ width: 14, height: 14, color: type.color }} aria-hidden="true" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default SubmitHub;
