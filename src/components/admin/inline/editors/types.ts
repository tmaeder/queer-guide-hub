import type { FieldConfig } from '@/types/cms';

export interface EditorProps {
  field: FieldConfig;
  initialValue: unknown;
  onSave: (value: unknown) => void;
  onCancel: () => void;
  saving: boolean;
}
