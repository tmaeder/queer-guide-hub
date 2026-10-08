import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useFlyerScan, type BuiltSubmission } from '@/hooks/useFlyerScan';
import { FlyerScanUpload } from '@/components/submission/FlyerScanUpload';
import { FlyerScanResults } from '@/components/submission/FlyerScanResults';

export default function FlyerScanBranch({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useLocalizedNavigate();

  if (!user) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="font-semibold">{t('contribute.auth.title', 'Sign in to contribute')}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {t(
              'contribute.auth.scanBody',
              'An account is required before you can scan and submit items.',
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

  return <AuthenticatedFlyerScan onBack={onBack} />;
}

function AuthenticatedFlyerScan({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const flyerScan = useFlyerScan();

  const submitBatch = async (rows: BuiltSubmission[]) => {
    try {
      const { inserted, enriched } = await flyerScan.submitBatch(rows);
      toast({
        title: t('contribute.scan.submitted', {
          count: inserted,
          defaultValue: '{{count}} item submitted',
        }),
        description:
          enriched > 0
            ? t('contribute.scan.linked', {
                count: enriched,
                defaultValue: '{{count}} linked to an existing entry',
              })
            : t('contribute.scan.reviewNote', 'Submissions are reviewed before publishing.'),
      });
      flyerScan.reset();
    } catch (error) {
      toast({
        title: t('contribute.common.failed', 'Submission failed'),
        description:
          error instanceof Error
            ? error.message
            : t('contribute.common.tryAgain', 'Please try again.'),
        variant: 'destructive',
      });
    }
  };

  return (
    <div>
      <Button variant="ghost" size="sm" onClick={onBack} className="mb-4 -ml-4">
        <ArrowLeft size={16} />
        {t('contribute.common.back', 'Back')}
      </Button>
      <FlyerScanUpload
        scanState={flyerScan.scanState}
        error={flyerScan.error}
        currentFileIndex={flyerScan.currentFileIndex}
        totalFiles={flyerScan.totalFiles}
        onFilesSelected={flyerScan.startScan}
        onUrlSubmit={flyerScan.startUrlScan}
        onReset={flyerScan.reset}
      >
        {flyerScan.results.length > 0 && (
          <FlyerScanResults
            results={flyerScan.results}
            onSubmitBatch={submitBatch}
            onDismiss={flyerScan.reset}
          />
        )}
      </FlyerScanUpload>
    </div>
  );
}
