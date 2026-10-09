import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  KIND_LABELS,
  MAX_LIST_ROWS,
  emptyOfKind,
  humanizeKey,
  isPlainObject,
  kindOf,
  normalizeStructured,
  renameKey,
  uniqueKey,
  type PlainObject,
  type StructuredKind,
} from './structuredValue';

const KINDS: StructuredKind[] = ['text', 'number', 'boolean', 'list', 'group'];

function AddMenu({
  label,
  onAdd,
  disabled,
}: {
  label: string;
  onAdd: (kind: StructuredKind) => void;
  disabled?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="self-start gap-1" disabled={disabled}>
          <Plus size={14} aria-hidden />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {KINDS.map((k) => (
          <DropdownMenuItem key={k} onSelect={() => onAdd(k)}>
            {KIND_LABELS[k]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RemoveButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8 shrink-0"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      <X size={14} aria-hidden />
    </Button>
  );
}

/**
 * Field-name input that commits on blur, refusing empty or duplicate names.
 * Rows are keyed by field name, so a rename remounts this with fresh state.
 */
function KeyInput({
  name,
  siblings,
  onRename,
  disabled,
}: {
  name: string;
  siblings: PlainObject;
  onRename: (to: string) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(name);
  const commit = () => {
    const next = draft.trim();
    if (!next || next === name || next in siblings) {
      setDraft(name);
      return;
    }
    onRename(next);
  };
  return (
    <Input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
      }}
      disabled={disabled}
      aria-label={`Name of field ${humanizeKey(name)}`}
      className="h-8 text-sm"
    />
  );
}

function ScalarInput({
  value,
  onChange,
  label,
  disabled,
}: {
  value: unknown;
  onChange: (v: unknown) => void;
  label: string;
  disabled?: boolean;
}) {
  if (typeof value === 'boolean') {
    return (
      <div className="flex h-8 items-center gap-2">
        <Switch checked={value} onCheckedChange={onChange} disabled={disabled} aria-label={label} />
        <span className="text-sm text-muted-foreground">{value ? 'Yes' : 'No'}</span>
      </div>
    );
  }
  if (typeof value === 'number') {
    return (
      <Input
        type="number"
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        disabled={disabled}
        aria-label={label}
        className="h-8 text-sm"
      />
    );
  }
  const text = value === null || value === undefined ? '' : String(value);
  if (text.length > 80 || text.includes('\n')) {
    return (
      <Textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label={label}
        className="min-h-[64px] text-sm"
      />
    );
  }
  return (
    <Input
      value={text}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-label={label}
      className="h-8 text-sm"
    />
  );
}

interface NodeProps {
  value: unknown;
  onChange: (v: unknown) => void;
  label: string;
  disabled?: boolean;
}

function GroupEditor({ value, onChange, label, disabled }: NodeProps & { value: PlainObject }) {
  const entries = Object.entries(value);
  return (
    <div className="flex flex-col gap-2">
      {entries.length === 0 && <p className="text-sm text-muted-foreground">No fields yet.</p>}
      {entries.map(([k, v]) => {
        const nested = Array.isArray(v) || isPlainObject(v);
        const childLabel = `${label} › ${humanizeKey(k)}`;
        return (
          <div key={k} className="flex flex-col gap-1">
            <div className="flex items-start gap-2">
              <div className="w-40 shrink-0">
                <KeyInput
                  name={k}
                  siblings={value}
                  onRename={(to) => onChange(renameKey(value, k, to))}
                  disabled={disabled}
                />
              </div>
              {!nested && (
                <div className="min-w-0 flex-1">
                  <ScalarInput
                    value={v}
                    onChange={(next) => onChange({ ...value, [k]: next })}
                    label={childLabel}
                    disabled={disabled}
                  />
                </div>
              )}
              {nested && <div className="flex-1" />}
              <RemoveButton
                label={`Remove ${humanizeKey(k)}`}
                disabled={disabled}
                onClick={() => {
                  const next = { ...value };
                  delete next[k];
                  onChange(next);
                }}
              />
            </div>
            {nested && (
              <div className="ml-4 border-l-2 border-border pl-4">
                <NodeEditor
                  value={v}
                  onChange={(next) => onChange({ ...value, [k]: next })}
                  label={childLabel}
                  disabled={disabled}
                />
              </div>
            )}
          </div>
        );
      })}
      <AddMenu
        label="Add field"
        disabled={disabled}
        onAdd={(kind) => onChange({ ...value, [uniqueKey(value)]: emptyOfKind(kind) })}
      />
    </div>
  );
}

function ListEditor({ value, onChange, label, disabled }: NodeProps & { value: unknown[] }) {
  const last = value[value.length - 1];
  if (value.length > MAX_LIST_ROWS) {
    return (
      <p className="text-sm text-muted-foreground">
        {value.length.toLocaleString()} items — too large to edit here.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {value.length === 0 && <p className="text-sm text-muted-foreground">No items yet.</p>}
      {value.map((item, i) => {
        const nested = Array.isArray(item) || isPlainObject(item);
        const childLabel = `${label} › item ${i + 1}`;
        const update = (next: unknown) => onChange(value.map((x, j) => (j === i ? next : x)));
        const remove = () => onChange(value.filter((_, j) => j !== i));
        return nested ? (
          <div key={i} className="flex flex-col gap-1 rounded-element bg-muted/40 p-2">
            <div className="flex items-center justify-between">
              <span className="text-2xs uppercase tracking-wide text-muted-foreground">Item {i + 1}</span>
              <RemoveButton label={`Remove item ${i + 1}`} onClick={remove} disabled={disabled} />
            </div>
            <NodeEditor value={item} onChange={update} label={childLabel} disabled={disabled} />
          </div>
        ) : (
          <div key={i} className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <ScalarInput value={item} onChange={update} label={childLabel} disabled={disabled} />
            </div>
            <RemoveButton label={`Remove item ${i + 1}`} onClick={remove} disabled={disabled} />
          </div>
        );
      })}
      <div className="flex gap-2">
        {value.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1"
            disabled={disabled}
            onClick={() => {
              // Same shape as the last item: a group copies its field names.
              const kind = kindOf(last);
              const blank = isPlainObject(last)
                ? Object.fromEntries(Object.entries(last).map(([k, x]) => [k, emptyOfKind(kindOf(x))]))
                : emptyOfKind(kind);
              onChange([...value, blank]);
            }}
          >
            <Plus size={14} aria-hidden />
            Add item
          </Button>
        )}
        <AddMenu
          label={value.length > 0 ? 'Add other' : 'Add item'}
          disabled={disabled}
          onAdd={(kind) => onChange([...value, emptyOfKind(kind)])}
        />
      </div>
    </div>
  );
}

function NodeEditor({ value, onChange, label, disabled }: NodeProps) {
  if (Array.isArray(value)) return <ListEditor value={value} onChange={onChange} label={label} disabled={disabled} />;
  if (isPlainObject(value)) return <GroupEditor value={value} onChange={onChange} label={label} disabled={disabled} />;
  return <ScalarInput value={value} onChange={onChange} label={label} disabled={disabled} />;
}

interface StructuredValueEditorProps {
  value: unknown;
  onChange: (value: unknown) => void;
  /** Accessible name prefix for nested inputs (usually the field label). */
  label: string;
  disabled?: boolean;
}

/**
 * Form editor for a jsonb value: groups of named fields, lists, text,
 * numbers and yes/no switches. Emits plain JS values; never shows JSON.
 */
export function StructuredValueEditor({ value, onChange, label, disabled }: StructuredValueEditorProps) {
  const v = normalizeStructured(value);
  if (v === null || v === undefined || v === '') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">No data yet.</span>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onChange({})}>
          Start with fields
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onChange([])}>
          Start with a list
        </Button>
      </div>
    );
  }
  return <NodeEditor value={v} onChange={onChange} label={label} disabled={disabled} />;
}
