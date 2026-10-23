import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { MailboxDeliveryStatus } from '@/lib/mailboxDelivery';

export interface EmailDeliveryState {
  status: MailboxDeliveryStatus | null | undefined;
  loading: boolean;
  refreshing: boolean;
  error: boolean;
  onRefresh: () => void;
}

export function EmailDeliveryStatus({
  status,
  loading,
  refreshing,
  error,
  onRefresh,
}: EmailDeliveryState) {
  const { t } = useTranslation();
  const label = status
    ? t(`inbox.mail.delivery.states.${status}`)
    : t('inbox.mail.delivery.unavailable');
  const help =
    status === 'accepted' || status === 'uncertain' || status === 'delivered'
      ? t(`inbox.mail.delivery.help.${status}`)
      : status === null && !loading && !error
        ? t('inbox.mail.delivery.unproved')
        : null;
  return (
    <div
      className="mt-4 flex flex-wrap items-start gap-x-4 gap-y-1 text-sm"
      aria-busy={loading || refreshing}
    >
      <div
        className="min-w-0 flex-1 basis-64 space-y-1"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <p className="font-medium">
          {loading
            ? t('inbox.mail.delivery.loading')
            : !status
              ? label
              : error
                ? t('inbox.mail.delivery.lastKnown', { status: label })
                : t('inbox.mail.delivery.label', { status: label })}
        </p>
        {help && <p className="text-muted-foreground">{help}</p>}
        {error && <p className="text-muted-foreground">{t('inbox.mail.delivery.error')}</p>}
      </div>
      <Button
        type="button"
        variant="link"
        size="sm"
        className="px-0 text-sm"
        onClick={onRefresh}
        disabled={loading || refreshing}
      >
        {refreshing && !loading
          ? t('inbox.mail.delivery.refreshing')
          : t('inbox.mail.delivery.refresh')}
      </Button>
    </div>
  );
}
