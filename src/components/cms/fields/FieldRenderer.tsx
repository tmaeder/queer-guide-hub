import React from 'react';
import type { FieldConfig } from '@/types/cms';
import { TextField } from './TextField';
import { TextAreaField } from './TextAreaField';
import { RichTextField } from './RichTextField';
import { NumberField } from './NumberField';
import { BooleanField } from './BooleanField';
import { SelectField } from './SelectField';
import { MultiSelectField } from './MultiSelectField';
import { DateField } from './DateField';
import { DateTimeField } from './DateTimeField';
import { ImageField } from './ImageField';
import { ImagesField } from './ImagesField';
import { LocationField } from './LocationField';
import { TagsField } from './TagsField';
import { JsonField } from './JsonField';

export interface FieldProps {
  field: FieldConfig;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
  disabled?: boolean;
  /** Batch-set multiple fields at once (used by location fields to set related fields) */
  setFields?: (fields: Record<string, unknown>) => void;
}

const FIELD_COMPONENTS: Record<string, React.ComponentType<FieldProps>> = {
  text: TextField,
  url: TextField,
  email: TextField,
  phone: TextField,
  textarea: TextAreaField,
  richtext: RichTextField,
  number: NumberField,
  boolean: BooleanField,
  select: SelectField,
  multiselect: MultiSelectField,
  date: DateField,
  datetime: DateTimeField,
  image: ImageField,
  images: ImagesField,
  location: LocationField,
  tags: TagsField,
  json: JsonField,
};

interface FieldRendererProps extends FieldProps {
  setFields?: (fields: Record<string, unknown>) => void;
}

export function FieldRenderer({ field, value, onChange, error, disabled, setFields }: FieldRendererProps) {
  if (field.hidden) {
    return null;
  }

  const Component = FIELD_COMPONENTS[field.type];

  if (!Component) {
    return (
      <div className="p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm">
        Unknown field type: <code>{field.type}</code> for field "{field.name}"
      </div>
    );
  }

  const isDisabled = disabled || field.readOnly;

  return (
    <Component
      field={field}
      value={value}
      onChange={onChange}
      error={error}
      disabled={isDisabled}
      setFields={setFields}
    />
  );
}
