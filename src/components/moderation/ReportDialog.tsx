import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useModeration, CreateFlagParams } from '@/hooks/useModeration';
import { toast } from 'sonner';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import CircularProgress from '@mui/material/CircularProgress';

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

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 2 }}>
          <FormControl fullWidth size="small">
            <InputLabel>Issue Type</InputLabel>
            <Select
              value={flagType}
              label="Issue Type"
              onChange={(e) => setFlagType(e.target.value as CreateFlagParams['flag_type'])}
            >
              {FLAG_TYPE_OPTIONS.map(opt => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {selectedType && (
            <Typography variant="caption" color="text.secondary">
              {selectedType.description}
            </Typography>
          )}

          <TextField
            label="Description"
            multiline
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Please describe the issue in detail (at least 10 characters)..."
            fullWidth
            size="small"
            helperText={`${reason.length}/2000`}
            inputProps={{ maxLength: 2000 }}
          />

          {flagType === 'CORRECTION' && (
            <TextField
              label="Suggested Changes"
              multiline
              rows={3}
              value={suggestedChanges}
              onChange={(e) => setSuggestedChanges(e.target.value)}
              placeholder="What should the correct information be?"
              fullWidth
              size="small"
            />
          )}
        </Box>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || reason.trim().length < 10}
          >
            {loading ? (
              <CircularProgress size={16} sx={{ mr: 1 }} aria-label="Loading" />
            ) : null}
            Submit Report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
