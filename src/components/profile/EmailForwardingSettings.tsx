import { useState } from 'react';
import { Mail, Copy, Check, RefreshCw, Inbox as InboxIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  useEmailForwardingAddress,
  useRotateEmailForwardingAddress,
} from '@/hooks/useEmailForwardingAddress';
import { Button } from '@/components/ui/button';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

export function EmailForwardingSettings() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data, isLoading } = useEmailForwardingAddress();
  const rotate = useRotateEmailForwardingAddress();

  const [copied, setCopied] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const copy = async () => {
    if (!data?.address) return;
    try {
      await navigator.clipboard.writeText(data.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked
    }
  };

  const handleRotate = () => {
    rotate.mutate(undefined, {
      onSuccess: () => {
        toast({
          title: t('settings.email.rotated', 'New forwarding address issued'),
          description: t(
            'settings.email.rotatedHint',
            'The old address stops working immediately.',
          ),
        });
        setConfirmOpen(false);
      },
      onError: (err) =>
        toast({
          title: t('settings.email.rotateFailed', 'Could not rotate address'),
          description: String(err),
          variant: 'destructive',
        }),
    });
  };

  return (
    <div className="mt-8 p-6 bg-muted">
      <div className="flex items-center gap-2 mb-2">
        <Mail size={18} className="text-primary" />
        <p className="font-bold">{t('settings.email.title', 'Trip-email forwarding')}</p>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        {t(
          'settings.email.description',
          'Forward any booking confirmation to your personal address and it lands in your trips inbox. Booking.com, Airbnb, and Lufthansa are recognized today.',
        )}
      </p>

      {isLoading || !data ? (
        <p className="text-sm text-muted-foreground">
          {t('settings.email.loading', 'Loading address…')}
        </p>
      ) : (
        <>
          <div className="flex items-center gap-2 p-4 bg-background font-mono text-base mb-4" style={{ wordBreak: 'break-all' }}>
            <div className="flex-1 min-w-0">{data.address}</div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void copy()}
              aria-label={t('settings.email.copy', 'Copy address')}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </Button>
          </div>

          <div className="flex gap-2 flex-wrap">
            <LocalizedLink to="/trips">
              <Button variant="outline" size="sm">
                <InboxIcon size={14} className="mr-1.5" />
                {t('settings.email.openInbox', 'Open inbox')}
              </Button>
            </LocalizedLink>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmOpen(true)}
              disabled={rotate.isPending}
            >
              <RefreshCw size={14} className="mr-1.5" />
              {t('settings.email.rotate', 'Rotate address')}
            </Button>
          </div>
        </>
      )}

      <Dialog open={confirmOpen} onOpenChange={(open) => !open && setConfirmOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.email.rotateTitle', 'Rotate forwarding address?')}</DialogTitle>
            <DialogDescription>
              {t(
                'settings.email.rotateConfirm',
                'The old address stops working immediately. Anyone using it (e.g. existing forwarding rules) will need the new address.',
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              {t('settings.email.cancel', 'Cancel')}
            </Button>
            <Button variant="destructive" onClick={handleRotate} disabled={rotate.isPending}>
              {rotate.isPending
                ? t('settings.email.rotating', 'Rotating…')
                : t('settings.email.confirmRotate', 'Rotate now')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
