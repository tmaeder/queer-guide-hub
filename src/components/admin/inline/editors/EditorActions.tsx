import { Check, X, Loader2 } from 'lucide-react';

interface Props {
  onConfirm: () => void;
  onCancel: () => void;
  saving: boolean;
  disabled?: boolean;
}

export function EditorActions({ onConfirm, onCancel, saving, disabled }: Props) {
  return (
    <div className="inline-flex items-center gap-1 ml-2 align-middle">
      <button
        type="button"
        onClick={onConfirm}
        disabled={saving || disabled}
        aria-label="Save"
        title="Save (Enter)"
        className="inline-flex items-center justify-center rounded-element border border-border bg-background hover:bg-accent disabled:opacity-50"
        style={{ width: 28, height: 28 }}
      >
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        aria-label="Cancel"
        title="Cancel (Esc)"
        className="inline-flex items-center justify-center rounded-element border border-border bg-background hover:bg-accent disabled:opacity-50"
        style={{ width: 28, height: 28 }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
