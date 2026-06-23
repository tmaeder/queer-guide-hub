import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useReportContent, type ReportableContentType } from '@/hooks/useReportContent';
import { useUserRelationships } from '@/hooks/useUserRelationships';

const REASONS = [
  'Spam or scam',
  'Harassment or hate',
  'Sexual or explicit content',
  'Impersonation',
  'Violence or threats',
  'Other',
] as const;

interface ReportContentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contentType: ReportableContentType;
  contentId: string;
  /** Author of the content — enables the optional "also block" action. */
  targetUserId?: string | null;
}

/**
 * Report-and-hide: files a report into the moderation queue and, optionally,
 * blocks the author (which now hides their content everywhere via the
 * is_blocked-aware RLS + matching engine).
 */
export function ReportContentDialog({
  open,
  onOpenChange,
  contentType,
  contentId,
  targetUserId,
}: ReportContentDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const report = useReportContent();
  const { blockUser } = useUserRelationships();
  const [reason, setReason] = useState<string>('');
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(false);

  const reset = () => {
    setReason('');
    setDetails('');
    setAlsoBlock(false);
  };

  const submit = async () => {
    if (!reason) return;
    try {
      await report.mutateAsync({ contentType, contentId, reason, details });
      if (alsoBlock && targetUserId) {
        await blockUser(targetUserId);
      }
      toast({
        title: t('report.sent', 'Report sent'),
        description: alsoBlock
          ? t('report.sentBlocked', 'Thanks — our team will review it, and you won’t see this person anymore.')
          : t('report.sentDesc', 'Thanks — our moderation team will review it.'),
      });
      reset();
      onOpenChange(false);
    } catch (e) {
      toast({
        title: t('common.error', 'Error'),
        description: e instanceof Error ? e.message : t('report.failed', 'Could not send the report.'),
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('report.title', 'Report content')}</DialogTitle>
          <DialogDescription>
            {t('report.description', 'Tell us what’s wrong. Reports are private and reviewed by our team.')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>{t('report.reasonLabel', 'Reason')}</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue placeholder={t('report.reasonPlaceholder', 'Choose a reason')} />
              </SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="report-details">{t('report.detailsLabel', 'Details (optional)')}</Label>
            <Textarea
              id="report-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={1000}
              placeholder={t('report.detailsPlaceholder', 'Add anything that helps us understand.')}
            />
          </div>

          {targetUserId && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={alsoBlock} onCheckedChange={(v) => setAlsoBlock(Boolean(v))} />
              {t('report.alsoBlock', 'Also block this person')}
            </label>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={report.isPending}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={submit} disabled={!reason || report.isPending}>
            {report.isPending ? t('report.sending', 'Sending…') : t('report.submit', 'Send report')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
