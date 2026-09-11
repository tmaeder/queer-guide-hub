import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * One dialog for all three row types, driven by a field spec.
 *
 * The alternative was three near-identical forms, and the thing that makes a
 * vocabulary rot is the moment adding a field means editing four files. A spec
 * means a new column is one entry here and one in the migration.
 *
 * Validation is deliberately thin on this side: the database rejects blank
 * bodies, control characters, unknown enum values and over-length text with a
 * real message, and that is the boundary that holds for every writer, not just
 * this form. What the client does is stop the obvious mistakes early and pass
 * the server's message through verbatim when it does not.
 */

export type FieldSpec =
  | { key: string; label: string; kind: 'text'; hint?: string; required?: boolean }
  | {
      key: string;
      label: string;
      kind: 'textarea';
      hint?: string;
      rows?: number;
      required?: boolean;
    }
  | { key: string; label: string; kind: 'list'; hint?: string; required?: boolean }
  | { key: string; label: string; kind: 'number'; hint?: string }
  | { key: string; label: string; kind: 'switch'; hint?: string }
  | {
      key: string;
      label: string;
      kind: 'select';
      options: { value: string; label: string }[];
      hint?: string;
    };

export interface RowEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  fields: FieldSpec[];
  value: Record<string, unknown>;
  saving?: boolean;
  onSave: (row: Record<string, unknown>) => Promise<void>;
}

/** Comma-separated in the form, text[] in the database. */
const toList = (raw: unknown): string =>
  Array.isArray(raw) ? (raw as string[]).join(', ') : typeof raw === 'string' ? raw : '';

const fromList = (raw: string): string[] =>
  raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export function RowEditorDialog({
  open,
  onOpenChange,
  title,
  description,
  fields,
  value,
  saving = false,
  onSave,
}: RowEditorDialogProps) {
  // Seeded once per mount. Callers give this component a `key` derived from the
  // row being edited, so opening a different row remounts it and the initial
  // state is simply correct — rather than syncing props into state in an
  // effect, which costs a cascading render on every open.
  const [draft, setDraft] = useState<Record<string, unknown>>(value);

  const set = (key: string, next: unknown) => setDraft((d) => ({ ...d, [key]: next }));

  const submit = async () => {
    const row: Record<string, unknown> = { ...draft };

    for (const field of fields) {
      if (field.kind === 'list') {
        row[field.key] = fromList(toList(row[field.key]));
      }
      if (field.kind === 'number') {
        row[field.key] = Number(row[field.key] ?? 0) || 0;
      }
      // An empty optional text field is NULL, never the empty string: the
      // database distinguishes "no rationale" from "a rationale of nothing",
      // and a CHECK constraint depends on that distinction.
      if ((field.kind === 'text' || field.kind === 'textarea') && row[field.key] === '') {
        row[field.key] = null;
      }
      if (field.kind !== 'switch' && 'required' in field && field.required) {
        const v = row[field.key];
        const empty =
          v == null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length);
        if (empty) {
          toast.error(`${field.label} is required`);
          return;
        }
      }
    }

    try {
      await onSave(row);
      toast.success('Saved');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        <div className="space-y-4">
          {fields.map((field) => {
            const id = `sg-field-${field.key}`;
            const raw = draft[field.key];
            return (
              <div key={field.key}>
                <Label htmlFor={id}>{field.label}</Label>
                {field.kind === 'text' ? (
                  <Input
                    id={id}
                    value={(raw as string) ?? ''}
                    onChange={(e) => set(field.key, e.target.value)}
                  />
                ) : null}
                {field.kind === 'textarea' ? (
                  <Textarea
                    id={id}
                    rows={field.rows ?? 4}
                    value={(raw as string) ?? ''}
                    onChange={(e) => set(field.key, e.target.value)}
                  />
                ) : null}
                {field.kind === 'list' ? (
                  <Input
                    id={id}
                    value={toList(raw)}
                    onChange={(e) => set(field.key, e.target.value)}
                  />
                ) : null}
                {field.kind === 'number' ? (
                  <Input
                    id={id}
                    type="number"
                    value={String(raw ?? 100)}
                    onChange={(e) => set(field.key, e.target.value)}
                  />
                ) : null}
                {field.kind === 'switch' ? (
                  <div className="mt-2">
                    <Switch
                      id={id}
                      checked={Boolean(raw)}
                      onCheckedChange={(next) => set(field.key, next)}
                    />
                  </div>
                ) : null}
                {field.kind === 'select' ? (
                  <Select
                    value={(raw as string) ?? ''}
                    onValueChange={(next) => set(field.key, next)}
                  >
                    <SelectTrigger id={id}>
                      <SelectValue placeholder="Choose" />
                    </SelectTrigger>
                    <SelectContent>
                      {field.options.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
                {field.hint ? (
                  <p className="mt-1 text-13 text-muted-foreground">{field.hint}</p>
                ) : null}
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
