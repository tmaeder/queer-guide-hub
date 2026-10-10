import { lazy, useState } from 'react';
import { ArrowLeft, ArrowRight, Camera, LockKeyhole } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { submissionTypes } from '@/config/submissionRegistry';
import SubmitForm from '@/pages/SubmitForm';

const FlyerScanBranch = lazy(() => import('./FlyerScanBranch'));
const SCAN = '__scan__';

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
      <Card className="overflow-hidden">
        <div className="h-1 bg-track-pink" aria-hidden="true" />
        <CardContent className="pt-6 sm:p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border-[3px] border-track-ring bg-background">
            <LockKeyhole size={18} aria-hidden="true" />
          </div>
          <p className="mt-6 text-title font-bold">
            {t('contribute.auth.title', 'Sign in to contribute')}
          </p>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            {t(
              'contribute.auth.body',
              'An account is required before you can add directory content.',
            )}
          </p>
          <div className="mt-8 flex gap-4 max-sm:flex-col-reverse">
            <Button variant="outline" onClick={onBack} className="max-sm:w-full">
              <ArrowLeft size={16} />
              {t('contribute.common.back', 'Back')}
            </Button>
            <Button onClick={() => navigate('/auth')} className="max-sm:w-full">
              {t('contribute.auth.cta', 'Sign in or create an account')}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (selectedType) {
    if (selectedType === SCAN) {
      return <FlyerScanBranch onBack={() => setSelectedType(undefined)} />;
    }
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <button
          type="button"
          onClick={() => setSelectedType(SCAN)}
          className="group flex min-h-28 items-center gap-4 rounded-container bg-foreground p-6 text-left text-background shadow-soft transition-all duration-fast hover:-translate-y-0.5 hover:shadow-soft-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:col-span-2 lg:col-span-3"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-[3px] border-background/70 bg-background text-foreground">
            <Camera size={20} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold">
              {t('contribute.chooser.scanTitle', 'Scan a flyer or link')}
            </span>
            <span className="mt-1 block text-sm leading-relaxed text-background/75">
              {t(
                'contribute.chooser.scanBody',
                'Extract several submissions from files or a web page.',
              )}
            </span>
          </span>
          <ArrowRight size={18} className="shrink-0" aria-hidden="true" />
        </button>
        {submissionTypes.map((type) => {
          const Icon = type.icon;
          return (
            <button
              key={type.id}
              type="button"
              onClick={() => setSelectedType(type.id)}
              className="group flex min-h-24 items-center gap-4 rounded-container bg-card p-4 text-left shadow-soft transition-all duration-fast hover:-translate-y-0.5 hover:bg-surface-container-low hover:shadow-soft-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-[3px] border-track-ring bg-background group-hover:bg-foreground group-hover:text-background">
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
