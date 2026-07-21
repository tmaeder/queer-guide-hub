import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EditorActions } from './EditorActions';
import type { EditorProps } from './types';

interface LinkRow {
  label: string;
  url?: string;
}

function toRows(value: unknown): LinkRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null)
    .map((v) => ({
      label: typeof v.label === 'string' ? v.label : '',
      url: typeof v.url === 'string' ? v.url : undefined,
    }));
}

/**
 * Editor for `link_list` fields — a jsonb array of `{label, url?}` rows
 * (milestone sources). Label is required per row; empty rows are dropped on
 * save.
 */
export function LinkListEditor({ initialValue, onSave, onCancel, saving }: EditorProps) {
  const [rows, setRows] = useState<LinkRow[]>(() => {
    const r = toRows(initialValue);
    return r.length ? r : [{ label: '' }];
  });

  const update = (i: number, patch: Partial<LinkRow>) =>
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const cleaned = () =>
    rows
      .map((r) => ({ label: r.label.trim(), ...(r.url?.trim() ? { url: r.url.trim() } : {}) }))
      .filter((r) => r.label);

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={row.label}
            onChange={(e) => update(i, { label: e.target.value })}
            placeholder="Label"
            disabled={saving}
            aria-label={`Source ${i + 1} label`}
            className="flex-1"
          />
          <Input
            value={row.url ?? ''}
            onChange={(e) => update(i, { url: e.target.value })}
            placeholder="https://…"
            disabled={saving}
            aria-label={`Source ${i + 1} URL`}
            className="flex-1"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRows(rows.filter((_, idx) => idx !== i))}
            aria-label={`Remove source ${i + 1}`}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={() => setRows([...rows, { label: '' }])}>
          <Plus size={14} className="mr-1" />
          Add source
        </Button>
        <EditorActions onConfirm={() => onSave(cleaned())} onCancel={onCancel} saving={saving} />
      </div>
    </div>
  );
}
