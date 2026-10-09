import { useState } from 'react';
import { StructuredValueEditor } from '@/components/cms/fields/structured/StructuredValueEditor';
import { EditorActions } from './EditorActions';
import { HoursEditor } from './HoursEditor';
import type { EditorProps } from './types';

/**
 * Inline editor for jsonb fields. Opening hours keep their dedicated
 * weekday editor; every other jsonb field gets the structured form editor
 * (named fields, lists, inputs) — never raw JSON.
 */
export function StructuredEditor(props: EditorProps) {
  if (props.field.name === 'hours') return <HoursEditor {...props} />;
  return <GenericStructuredEditor {...props} />;
}

function GenericStructuredEditor({ field, initialValue, onSave, onCancel, saving }: EditorProps) {
  const [value, setValue] = useState<unknown>(initialValue);
  return (
    <div className="flex flex-col gap-2 rounded-element bg-muted p-2">
      <StructuredValueEditor value={value} onChange={setValue} label={field.label} disabled={saving} />
      <div className="flex justify-end">
        <EditorActions onConfirm={() => onSave(value)} onCancel={onCancel} saving={saving} />
      </div>
    </div>
  );
}
