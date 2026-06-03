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
import { SocialLinksField } from './SocialLinksField';
import { CityAutocompleteField } from './CityAutocompleteField';
import { CountryAutocompleteField } from './CountryAutocompleteField';
import { UnifiedTagAutocompleteField } from './UnifiedTagAutocompleteField';
import { VenueAutocompleteField } from './VenueAutocompleteField';
import { ProfessionAutocompleteField } from './ProfessionAutocompleteField';

export interface FieldProps {
  field: FieldConfig;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
  disabled?: boolean;
  /** Batch-set multiple fields at once (used by location fields to set related fields) */
  setFields?: (fields: Record<string, unknown>) => void;
  /** All current form values (used by fields that depend on sibling field values) */
  allValues?: Record<string, unknown>;
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
  social_links: SocialLinksField,
  city_autocomplete: CityAutocompleteField,
  country_autocomplete: CountryAutocompleteField,
  unified_tag: UnifiedTagAutocompleteField,
  venue_autocomplete: VenueAutocompleteField,
  profession_autocomplete: ProfessionAutocompleteField,
};

interface FieldRendererProps extends FieldProps {
  setFields?: (fields: Record<string, unknown>) => void;
  allValues?: Record<string, unknown>;
}

export function FieldRenderer({
  field,
  value,
  onChange,
  error,
  disabled,
  setFields,
  allValues,
}: FieldRendererProps) {
  if (field.hidden) {
    return null;
  }

  const Component = FIELD_COMPONENTS[field.type];

  if (!Component) {
    return (
      <div className="p-4 rounded-element bg-muted border border-border text-foreground text-sm">
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
      allValues={allValues}
    />
  );
}
