import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useAdminEditMode } from '@/hooks/useAdminEditMode';
import { useInlineSave } from '@/hooks/useInlineSave';
import { getContentType } from '@/config/contentTypes';
import { getEditorForFieldType } from './editors';
import type { FieldConfig } from '@/types/cms';

interface EditableProps {
  contentType: string;
  recordId: string;
  field: string;
  /** Current value (used to seed the editor). */
  value: unknown;
  /** What to render in display mode. */
  children: ReactNode;
  /** Called after a successful save so the parent can refresh its data. */
  onSaved?: (newValue: unknown) => void;
  /** Override field type — useful when registry says `json` but page renders a simple shape. */
  fieldOverride?: Partial<FieldConfig>;
  /** Hide the affordance even for admins (e.g. inside another Editable). */
  disabled?: boolean;
  /** Render mode for the wrapper. */
  as?: 'span' | 'div';
  className?: string;
}

export function Editable({
  contentType,
  recordId,
  field,
  value,
  children,
  onSaved,
  fieldOverride,
  disabled,
  as = 'span',
  className,
}: EditableProps) {
  const { isAdmin, altHeld } = useAdminEditMode();
  const [editing, setEditing] = useState(false);
  const { save, saving } = useInlineSave(contentType, recordId);

  const fieldConfig = useMemo<FieldConfig | null>(() => {
    const cfg = getContentType(contentType);
    if (!cfg) return null;
    const base = cfg.fields.find((f) => f.name === field) ?? null;
    if (!base) {
      if (!fieldOverride?.type || !fieldOverride.label) return null;
      return {
        name: field,
        label: fieldOverride.label,
        type: fieldOverride.type,
        group: 'basic',
        ...fieldOverride,
      } as FieldConfig;
    }
    return fieldOverride ? ({ ...base, ...fieldOverride } as FieldConfig) : base;
  }, [contentType, field, fieldOverride]);

   
  const Editor = useMemo(
    () => (fieldConfig ? getEditorForFieldType(fieldConfig.type) : null),
    [fieldConfig],
  );
   
  const adminActive =
    isAdmin && !disabled && fieldConfig != null && Editor != null && !fieldConfig.readOnly;

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!adminActive) return;
      if (!e.altKey) return;
      e.preventDefault();
      e.stopPropagation();
      setEditing(true);
    },
    [adminActive],
  );

  const onConfirm = useCallback(
    async (next: unknown) => {
      if (!fieldConfig) return;
      const res = await save({ field: fieldConfig, value: next });
      if (res.success) {
        setEditing(false);
        onSaved?.(next);
      }
    },
    [fieldConfig, save, onSaved],
  );

  if (!adminActive) {
    return children as React.ReactElement;
  }

  const Wrapper = (as === 'div' ? 'div' : 'span') as 'span';

  if (editing && Editor && fieldConfig) {
    return (
      <Wrapper className={className} data-inline-editor>
        {/* eslint-disable-next-line react-hooks/static-components -- component-like reference resolved from a registry/factory; not redefined per render despite the rule's heuristic. */}
        <Editor
          field={fieldConfig}
          initialValue={value}
          onSave={onConfirm}
          onCancel={() => setEditing(false)}
          saving={saving}
        />
      </Wrapper>
    );
  }

  const affordanceClass = altHeld
    ? 'outline outline-1 outline-dashed outline-foreground/40 cursor-pointer rounded-element'
    : '';

  return (
    <Wrapper
      onClick={handleClick}
      title={altHeld ? `Alt-click to edit · ${fieldConfig.label}` : undefined}
      className={[className, affordanceClass].filter(Boolean).join(' ')}
      data-editable-field={field}
    >
      {children}
    </Wrapper>
  );
}
