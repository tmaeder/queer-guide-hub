import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
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

        <div className="flex flex-col gap-4 py-2">
          <p className="text-sm text-muted-foreground">
            Check the fields you want to update. Only checked fields will be changed.
          </p>

          {fields.map((field) => (
            <div
              key={field.key}
              className={`flex items-start gap-2 p-3 rounded border ${enabledFields.has(field.key) ? 'border-primary opacity-100' : 'border-border opacity-60'}`}
            >
              <Checkbox
                checked={enabledFields.has(field.key)}
                onCheckedChange={() => toggleField(field.key)}
              />
              <div className="flex-1 flex flex-col gap-1">
                <Label style={{ fontSize: 13, fontWeight: 500 }}>{field.label}</Label>
                <BulkFieldInput
                  field={field}
                  value={values[field.key]}
                  onChange={(v) => setValues((prev) => ({ ...prev, [field.key]: v }))}
                  disabled={!enabledFields.has(field.key)}
                />
              </div>
            </div>
          ))}
        </div>

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
        <div className="flex items-center gap-2">
          <Switch
            checked={value === true}
            onCheckedChange={(v) => onChange(v)}
            disabled={disabled}
          />
          <p className="text-sm">{value ? 'Yes' : 'No'}</p>
        </div>
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
