import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
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

/**
 * Settings panel for the trip-email forwarding address.
 *
 * Lets the user view their unique address, copy it, and rotate it
 * (revoke + mint a new one) if it leaks. Rotation is destructive —
 * confirmation dialog gates it.
 */
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
      // Clipboard blocked — chip stays visible so user can copy manually.
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
    <Box sx={{ mt: 4, p: 3, bgcolor: 'action.hover' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Mail style={{ width: 18, height: 18, color: 'var(--primary)' }} />
        <Typography sx={{ fontWeight: 700 }}>
          {t('settings.email.title', 'Trip-email forwarding')}
        </Typography>
      </Box>
      <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem', mb: 2 }}>
        {t(
          'settings.email.description',
          'Forward any booking confirmation to your personal address and it lands in your trips inbox. Booking.com, Airbnb, and Lufthansa are recognized today.',
        )}
      </Typography>

      {isLoading || !data ? (
        <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
          {t('settings.email.loading', 'Loading address…')}
        </Typography>
      ) : (
        <>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              p: 1.5,
              bgcolor: 'background.paper',
              fontFamily: 'monospace',
              fontSize: '0.95rem',
              wordBreak: 'break-all',
              mb: 1.5,
            }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>{data.address}</Box>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void copy()}
              aria-label={t('settings.email.copy', 'Copy address')}
            >
              {copied ? <Check style={{ width: 16, height: 16 }} /> : <Copy style={{ width: 16, height: 16 }} />}
            </Button>
          </Box>

          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <LocalizedLink to="/trips">
              <Button variant="outline" size="sm">
                <InboxIcon style={{ width: 14, height: 14, marginRight: 6 }} />
                {t('settings.email.openInbox', 'Open inbox')}
              </Button>
            </LocalizedLink>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmOpen(true)}
              disabled={rotate.isPending}
            >
              <RefreshCw style={{ width: 14, height: 14, marginRight: 6 }} />
              {t('settings.email.rotate', 'Rotate address')}
            </Button>
          </Box>
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
    </Box>
  );
}
