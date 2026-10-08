import { useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { submissionTypes } from '@/config/submissionRegistry';
import SubmitForm from '@/pages/SubmitForm';

interface AddSomethingBranchProps {
  initialType?: string;
  onBack: () => void;
}

export default function AddSomethingBranch({ initialType, onBack }: AddSomethingBranchProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useLocalizedNavigate();
  const [selectedType, setSelectedType] = useState(initialType);

  if (!user) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="font-semibold">{t('contribute.auth.title', 'Sign in to contribute')}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {t(
              'contribute.auth.body',
              'An account is required before you can add directory content.',
            )}
          </p>
          <div className="mt-6 flex gap-4">
            <Button variant="outline" onClick={onBack}>
              <ArrowLeft size={16} />
              {t('contribute.common.back', 'Back')}
            </Button>
            <Button onClick={() => navigate('/auth')}>
              {t('contribute.auth.cta', 'Sign in or create an account')}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (selectedType) {
    return (
      <SubmitForm contentType={selectedType} embedded onBack={() => setSelectedType(undefined)} />
    );
  }

  return (
    <div>
      <Button variant="ghost" size="sm" onClick={onBack} className="mb-4 -ml-4">
        <ArrowLeft size={16} />
        {t('contribute.common.back', 'Back')}
      </Button>
      <div className="grid gap-4 sm:grid-cols-2">
        {submissionTypes.map((type) => {
          const Icon = type.icon;
          return (
            <button
              key={type.id}
              type="button"
              onClick={() => setSelectedType(type.id)}
              className="group flex items-start gap-4 rounded-container border bg-card p-4 text-left transition-colors hover:border-foreground/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-element bg-muted group-hover:bg-foreground group-hover:text-background">
                <Icon size={20} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">
                  {t(`contributeForm.types.${type.id}`, type.label)}
                </span>
              </span>
              <ArrowRight size={16} className="mt-1 shrink-0" aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
