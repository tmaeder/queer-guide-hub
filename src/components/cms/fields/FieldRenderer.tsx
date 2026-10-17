import { DynamicChoiceField } from './DynamicChoiceField';
import { RedirectDomainField } from './RedirectDomainField';
import { OrganisationRelationshipsField } from './OrganisationRelationshipsField';
import React from 'react';
import { contentKind, preserveStructuredStorage } from './structured/structuredValue';
import { OrganisationLocationsField } from './OrganisationLocationsField';
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
import { RolesAutocompleteField } from './RolesAutocompleteField';

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
  originalValues?: Record<string, unknown>;
  onPersistedChange?: () => Promise<void>;
}

const FIELD_COMPONENTS: Record<string, React.ComponentType<FieldProps>> = {
  redirect_domain: RedirectDomainField,
  organisation_locations: OrganisationLocationsField,
  organisation_relationships: OrganisationRelationshipsField,
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
  roles_autocomplete: RolesAutocompleteField,
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
  originalValues,
  onPersistedChange,
}: FieldRendererProps) {
  if (field.hidden) {
    return null;
  }

  // Conditional visibility (e.g. a redirect's `slug` only when type is SHORT).
  // Treated as visible while `allValues` is absent, so a field never vanishes
  // mid-edit just because form state has not propagated yet.
  if (field.visibleWhen && allValues && !field.visibleWhen(allValues)) {
    return null;
  }

  const adaptive = ['text', 'textarea', 'richtext', 'json'].includes(field.type);
  const kind = adaptive ? contentKind(value) : 'text';
  const effectiveType =
    kind === 'structured' || kind === 'unreadable'
      ? 'json'
      : kind === 'richtext'
        ? 'richtext'
        : field.type;
  const Component =
    field.dynamicOptions && ['select', 'multiselect'].includes(field.type)
      ? DynamicChoiceField
      : FIELD_COMPONENTS[effectiveType];

  if (!Component) {
    return (
      <div className="p-4 rounded-element bg-muted text-foreground text-sm">
        Unknown field type: <code>{field.type}</code> for field "{field.name}"
      </div>
    );
  }

  const isDisabled =
    disabled ||
    field.readOnly ||
    (field.immutable && !!originalValues?.id && !!originalValues[field.name]);

  return (
    <Component
      field={field}
      value={value}
      onChange={
        kind === 'structured' && field.type !== 'json'
          ? (next) => onChange(preserveStructuredStorage(value, next))
          : onChange
      }
      error={error}
      disabled={isDisabled}
      setFields={setFields}
      allValues={allValues}
      originalValues={originalValues}
      onPersistedChange={onPersistedChange}
    />
  );
}
