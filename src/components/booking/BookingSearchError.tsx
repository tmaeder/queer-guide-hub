import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

export function BookingSearchError({
  message,
  onRetry,
  retrying = false,
}: {
  message: string;
  onRetry: () => void;
  retrying?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="flex flex-col items-start gap-4 rounded-element bg-muted p-6">
      <p className="text-sm">{message}</p>
      <Button type="button" variant="outline" onClick={onRetry} disabled={retrying}>
        {retrying ? t('common.retrying', 'Retrying…') : t('common.retry', 'Try again')}
      </Button>
    </div>
  );
}
