import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { TrackLoader } from '@/components/transit/TrackLoader';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useModeration, CreateFlagParams } from '@/hooks/useModeration';
import { toast } from 'sonner';

interface ReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contentType: string;
  contentId: string;
  contentName?: string;
}

const FLAG_TYPE_OPTIONS = [
  {
    value: 'REVIEW',
    label: 'Needs Review',
    description: 'This content needs attention or verification',
  },
  {
    value: 'CORRECTION',
    label: 'Suggest Correction',
    description: 'Some information is incorrect or outdated',
  },
  {
    value: 'DELETE_REQUEST',
    label: 'Request Deletion',
    description: 'This content should be removed',
  },
  { value: 'DUPLICATE', label: 'Duplicate', description: 'This is a duplicate of another entry' },
  {
    value: 'LINK_ISSUE',
    label: 'Broken Link',
    description: 'A link on this page is broken or wrong',
  },
  { value: 'OTHER', label: 'Other', description: 'Something else' },
] as const;

/**
 * Editorial data-issue report (wrong info, broken link, duplicate, deletion
 * request) on entity detail pages — files a moderation *flag* via
 * useModeration.createFlag. NOT the user-safety flow: reporting user-generated
 * content (posts/comments/profiles/groups) is ReportContentDialog.
 */
export function ReportDialog({
  open,
  onOpenChange,
  contentType,
  contentId,
  contentName,
}: ReportDialogProps) {
  const { t } = useTranslation();
  const { createFlag, loading } = useModeration();
  const [flagType, setFlagType] = useState<CreateFlagParams['flag_type']>('REVIEW');
  const [reason, setReason] = useState('');
  const [suggestedChanges, setSuggestedChanges] = useState('');

  const handleSubmit = async () => {
    const params: CreateFlagParams = {
      content_type: contentType,
      content_id: contentId,
      flag_type: flagType,
      reason,
    };

    if (flagType === 'CORRECTION' && suggestedChanges.trim()) {
      try {
        params.suggested_changes = JSON.parse(suggestedChanges);
      } catch {
        params.suggested_changes = { text: suggestedChanges };
      }
    }

    const result = await createFlag(params);
    if (result.success) {
      toast.success(
        t(
          'entityActions.reportSuccess',
          'Report submitted. Thank you for helping improve our data!',
        ),
      );
      onOpenChange(false);
      setReason('');
      setSuggestedChanges('');
      setFlagType('REVIEW');
    } else {
      toast.error(
        result.error === 'Must be logged in to create a report'
          ? t('entityActions.signInToReport', 'Sign in to report an issue.')
          : t('entityActions.reportFailed', 'Failed to submit report'),
      );
    }
  };

  const selectedType = FLAG_TYPE_OPTIONS.find((o) => o.value === flagType);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('entityActions.reportTitle', 'Report Issue')}</DialogTitle>
          <DialogDescription>
            {contentName
              ? t('entityActions.reportFor', {
                  defaultValue: 'Report an issue with "{{name}}"',
                  name: contentName,
                })
              : t('entityActions.reportForContent', 'Report an issue with this content')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-6 mt-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="entity-report-type">{t('entityActions.issueType', 'Issue Type')}</Label>
            <Select
              value={flagType}
              onValueChange={(v) => setFlagType(v as CreateFlagParams['flag_type'])}
            >
              <SelectTrigger id="entity-report-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FLAG_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {t(`entityActions.issue.${opt.value}.label`, opt.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedType && (
            <p className="text-xs text-muted-foreground">
              {t(`entityActions.issue.${selectedType.value}.description`, selectedType.description)}
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="entity-report-reason">
              {t('entityActions.description', 'Description')}
            </Label>
            <Textarea
              id="entity-report-reason"
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t(
                'entityActions.descriptionPlaceholder',
                'Please describe the issue in detail (at least 10 characters)...',
              )}
              maxLength={2000}
            />
            <span className="text-xs text-muted-foreground">{`${reason.length}/2000`}</span>
          </div>

          {flagType === 'CORRECTION' && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="entity-report-changes">
                {t('entityActions.suggestedChanges', 'Suggested Changes')}
              </Label>
              <Textarea
                id="entity-report-changes"
                rows={3}
                value={suggestedChanges}
                onChange={(e) => setSuggestedChanges(e.target.value)}
                placeholder={t(
                  'entityActions.correctionPlaceholder',
                  'What should the correct information be?',
                )}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={loading || reason.trim().length < 10}>
            {loading ? (
              <TrackLoader size={16} label={t('common.loading', 'Loading')} className="mr-1" />
            ) : null}
            {t('entityActions.submitReport', 'Submit Report')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
