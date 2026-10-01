import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Pencil } from 'lucide-react';
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
  /**
   * Public pages require Alt-click so ordinary clicks are not hijacked. Admin
   * surfaces that exist only to edit — the content list — set this false so a
   * plain click opens the editor.
   */
  requireAltClick?: boolean;
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
  requireAltClick = true,
  as = 'span',
  className,
}: EditableProps) {
  const { isAdmin, editMode } = useAdminEditMode();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  // `virtual` fields are joined/computed and have no column to write — the list
  // view wraps every extra column in an Editable, so without this a click on
  // Country / Population / Venues on a village opened an editor that could only
  // ever fail at the DB.
  const adminActive =
    isAdmin &&
    !disabled &&
    fieldConfig != null &&
    Editor != null &&
    !fieldConfig.readOnly &&
    !fieldConfig.virtual;

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!adminActive) return;
      // Alt-click still works on its own. The pin is the discoverable
      // equivalent: with edit mode on, a plain click opens the editor, which
      // is why the affordance is drawn at the same time.
      if (requireAltClick && !e.altKey && !editMode) return;
      e.preventDefault();
      e.stopPropagation();
      setError(null);
      setEditing(true);
    },
    [adminActive, requireAltClick, editMode],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!adminActive || (requireAltClick && !editMode)) return;
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      e.stopPropagation();
      setError(null);
      setEditing(true);
    },
    [adminActive, requireAltClick, editMode],
  );

  const onConfirm = useCallback(
    async (next: unknown) => {
      if (!fieldConfig) return;
      const res = await save({ field: fieldConfig, value: next });
      if (res.success) {
        setEditing(false);
        setError(null);
        onSaved?.(next);
      } else {
        setError(res.error ?? `Could not save ${fieldConfig.label}`);
      }
    },
    [fieldConfig, save, onSaved],
  );

  if (!adminActive) {
    return children as React.ReactElement;
  }

  const Wrapper = as === 'div' ? 'div' : 'span';

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
        {error && (
          <span role="alert" className="mt-1 block text-xs font-medium text-destructive">
            {error}
          </span>
        )}
      </Wrapper>
    );
  }

  const showAffordance = requireAltClick ? editMode : adminActive;
  const affordanceClass = showAffordance
    ? `${as === 'div' ? 'flex' : 'inline-flex'} group/editable min-h-11 items-center gap-1 rounded-element -mx-2 px-2 cursor-pointer transition-colors hover:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 sm:min-h-8`
    : '';

  return (
    <Wrapper
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role={showAffordance ? 'button' : undefined}
      tabIndex={showAffordance ? 0 : undefined}
      aria-label={showAffordance ? `Edit ${fieldConfig.label}` : undefined}
      title={
        showAffordance
          ? `${requireAltClick && !editMode ? 'Alt-click' : 'Click'} to edit · ${fieldConfig.label}`
          : undefined
      }
      className={[className, affordanceClass].filter(Boolean).join(' ')}
      data-editable-field={field}
    >
      {children}
      {showAffordance && (
        <Pencil
          size={13}
          aria-hidden="true"
          className="shrink-0 opacity-50 transition-opacity motion-reduce:transition-none sm:opacity-0 sm:group-hover/editable:opacity-60 sm:group-focus-visible/editable:opacity-60"
        />
      )}
    </Wrapper>
  );
}
