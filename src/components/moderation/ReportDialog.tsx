import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  { value: 'REVIEW', label: 'Needs Review', description: 'This content needs attention or verification' },
  { value: 'CORRECTION', label: 'Suggest Correction', description: 'Some information is incorrect or outdated' },
  { value: 'DELETE_REQUEST', label: 'Request Deletion', description: 'This content should be removed' },
  { value: 'DUPLICATE', label: 'Duplicate', description: 'This is a duplicate of another entry' },
  { value: 'LINK_ISSUE', label: 'Broken Link', description: 'A link on this page is broken or wrong' },
  { value: 'OTHER', label: 'Other', description: 'Something else' },
] as const;

export function ReportDialog({ open, onOpenChange, contentType, contentId, contentName }: ReportDialogProps) {
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
      toast.success('Report submitted. Thank you for helping improve our data!');
      onOpenChange(false);
      setReason('');
      setSuggestedChanges('');
      setFlagType('REVIEW');
    } else {
      toast.error(result.error || 'Failed to submit report');
    }
  };

  const selectedType = FLAG_TYPE_OPTIONS.find(o => o.value === flagType);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report Issue</DialogTitle>
          <DialogDescription>
            {contentName
              ? `Report an issue with "${contentName}"`
              : 'Report an issue with this content'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 mt-2">
          <div className="flex flex-col gap-1.5">
            <Label>Issue Type</Label>
            <Select
              value={flagType}
              onValueChange={(v) => setFlagType(v as CreateFlagParams['flag_type'])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FLAG_TYPE_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedType && (
            <p className="text-xs text-muted-foreground">
              {selectedType.description}
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>Description</Label>
            <Textarea
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Please describe the issue in detail (at least 10 characters)..."
              maxLength={2000}
            />
            <span className="text-xs text-muted-foreground">{`${reason.length}/2000`}</span>
          </div>

          {flagType === 'CORRECTION' && (
            <div className="flex flex-col gap-1.5">
              <Label>Suggested Changes</Label>
              <Textarea
                rows={3}
                value={suggestedChanges}
                onChange={(e) => setSuggestedChanges(e.target.value)}
                placeholder="What should the correct information be?"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || reason.trim().length < 10}
          >
            {loading ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-label="Loading" />
            ) : null}
            Submit Report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
