/**
 * ReportHotline — small dialog that lets visitors flag a broken/unsafe
 * hotline entry. Anonymous insert into public.hotline_reports.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Flag, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';

type Reason = 'disconnected' | 'wrong_number' | 'closed' | 'unsafe' | 'other';

export function ReportHotline({ hotlineId }: { hotlineId: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<Reason>('disconnected');
  const [detail, setDetail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    const { error: e } = await supabase.from('hotline_reports').insert({
      hotline_id: hotlineId,
      reason,
      detail: detail.trim() || null,
    });
    setSubmitting(false);
    if (e) {
      setError(e.message);
      return;
    }
    setDone(true);
    setTimeout(() => {
      setOpen(false);
      setDone(false);
      setDetail('');
      setReason('disconnected');
    }, 1500);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          aria-label={t('help.report_aria', 'Report a problem with this hotline')}
        >
          <Flag size={12} aria-hidden />
          {t('help.report', 'Report')}
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('help.report_title', 'Report this hotline')}</DialogTitle>
          <DialogDescription>
            {t(
              'help.report_desc',
              'Thanks for helping keep this list accurate. Reports are reviewed by our team.',
            )}
          </DialogDescription>
        </DialogHeader>
        {done ? (
          <p className="py-4 text-sm">
            {t('help.report_thanks', 'Thank you. We’ll review it.')}
          </p>
        ) : (
          <div className="flex flex-col gap-3 py-2">
            <div>
              <Label className="mb-1 block text-xs font-semibold">
                {t('help.report_reason', 'Reason')}
              </Label>
              <Select value={reason} onValueChange={(v) => setReason(v as Reason)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="disconnected">
                    {t('help.report_reason.disconnected', 'Number disconnected / no answer')}
                  </SelectItem>
                  <SelectItem value="wrong_number">
                    {t('help.report_reason.wrong_number', 'Wrong number')}
                  </SelectItem>
                  <SelectItem value="closed">
                    {t('help.report_reason.closed', 'Service has shut down')}
                  </SelectItem>
                  <SelectItem value="unsafe">
                    {t('help.report_reason.unsafe', 'Unsafe / harmful experience')}
                  </SelectItem>
                  <SelectItem value="other">
                    {t('help.report_reason.other', 'Other')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1 block text-xs font-semibold">
                {t('help.report_detail', 'Details (optional)')}
              </Label>
              <Textarea
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                rows={3}
                maxLength={500}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}
        {!done && (
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting ? (
                <Loader2 size={14} className="mr-2 animate-spin" />
              ) : (
                <Flag size={14} className="mr-2" />
              )}
              {t('help.report_submit', 'Submit report')}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
