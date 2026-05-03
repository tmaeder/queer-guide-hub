import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Checkbox from '@mui/material/Checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { updateRowsByIds } from '@/hooks/usePageFetchers';
import { toast } from 'sonner';
import type { BulkEditFieldConfig } from './types';

interface DataTableBulkEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fields: BulkEditFieldConfig[];
  selectedIds: Set<string>;
  tableName: string;
  onSuccess: () => void;
}

export function DataTableBulkEditDialog({
  open,
  onOpenChange,
  fields,
  selectedIds,
  tableName,
  onSuccess,
}: DataTableBulkEditDialogProps) {
  const [enabledFields, setEnabledFields] = useState<Set<string>>(new Set());
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);

  const toggleField = (key: string) => {
    setEnabledFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSave = async () => {
    const updates: Record<string, unknown> = {};
    for (const field of fields) {
      if (enabledFields.has(field.key)) {
        updates[field.column] = values[field.key];
      }
    }

    if (Object.keys(updates).length === 0) {
      toast.error('Select at least one field to update');
      return;
    }

    setSaving(true);
    try {
      const { error } = await updateRowsByIds(tableName, Array.from(selectedIds), updates);
      if (error) throw error;
      toast.success(`Updated ${selectedIds.size} items`);
      onOpenChange(false);
      setEnabledFields(new Set());
      setValues({});
      onSuccess();
    } catch {
      toast.error('Failed to update items');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setEnabledFields(new Set());
    setValues({});
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent style={{ maxWidth: 480 }}>
        <DialogHeader>
          <DialogTitle>Bulk Edit {selectedIds.size} items</DialogTitle>
        </DialogHeader>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, py: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Check the fields you want to update. Only checked fields will be changed.
          </Typography>

          {fields.map((field) => (
            <Box
              key={field.key}
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1,
                p: 1.5,
                borderRadius: 1,
                border: '1px solid',
                borderColor: enabledFields.has(field.key)
                  ? 'primary.main'
                  : 'var(--border, #e4e4e7)',
                opacity: enabledFields.has(field.key) ? 1 : 0.6,
              }}
            >
              <Checkbox
                checked={enabledFields.has(field.key)}
                onChange={() => toggleField(field.key)}
                size="small"
                sx={{ mt: -0.5 }}
              />
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <Label style={{ fontSize: 13, fontWeight: 500 }}>{field.label}</Label>
                <BulkFieldInput
                  field={field}
                  value={values[field.key]}
                  onChange={(v) => setValues((prev) => ({ ...prev, [field.key]: v }))}
                  disabled={!enabledFields.has(field.key)}
                />
              </Box>
            </Box>
          ))}
        </Box>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || enabledFields.size === 0}>
            {saving ? 'Updating...' : `Apply to ${selectedIds.size} items`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkFieldInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: BulkEditFieldConfig;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled: boolean;
}) {
  switch (field.type) {
    case 'select':
      return (
        <Select value={(value as string) || ''} onValueChange={onChange} disabled={disabled}>
          <SelectTrigger style={{ height: 32 }}>
            <SelectValue placeholder={`Select ${field.label}`} />
          </SelectTrigger>
          <SelectContent>
            {(field.options || []).map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case 'boolean':
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Switch
            checked={value === true}
            onCheckedChange={(v) => onChange(v)}
            disabled={disabled}
          />
          <Typography variant="body2">{value ? 'Yes' : 'No'}</Typography>
        </Box>
      );
    case 'text':
      return (
        <Input
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          style={{ height: 32 }}
        />
      );
    default:
      return null;
  }
}
