import { z, type ZodTypeAny } from 'zod';
import type { ContentTypeConfig, FieldConfig, FieldType } from '@/types/cms';

const URL_REGEX = /^https?:\/\/.+/i;
const PHONE_REGEX = /^[+\d][\d\s().-]{4,}$/;

function baseSchemaForType(type: FieldType): ZodTypeAny {
  switch (type) {
    case 'text':
    case 'textarea':
    case 'richtext':
      return z.string();
    case 'number':
      return z.number();
    case 'boolean':
      return z.boolean();
    // The autocompletes store a single resolved id/name, so they are strings.
    case 'select':
    case 'city_autocomplete':
    case 'country_autocomplete':
      return z.string();
    // 'tags' belongs here, not with the string cases: TagsField emits an array
    // and every tags column is text[]. Grouping it above made
    // "expected string, received array" block the save of any record with tags.
    case 'multiselect':
    case 'images':
    case 'tags':
      return z.array(z.string());
    case 'date':
    case 'datetime':
      return z.string();
    case 'url':
      return z.string().regex(URL_REGEX, 'Must be a valid http(s) URL');
    case 'email':
      return z.string().email('Must be a valid email');
    case 'phone':
      return z.string().regex(PHONE_REGEX, 'Must be a valid phone number');
    case 'image':
      return z.string();
    case 'location':
    case 'json':
      return z.unknown();
    default:
      return z.unknown();
  }
}

export function fieldToZod(field: FieldConfig): ZodTypeAny {
  let schema = baseSchemaForType(field.type);

  if (schema instanceof z.ZodString) {
    if (typeof field.minLength === 'number') schema = schema.min(field.minLength);
    if (typeof field.maxLength === 'number') schema = schema.max(field.maxLength);
  }
  if (schema instanceof z.ZodNumber) {
    if (typeof field.min === 'number') schema = schema.min(field.min);
    if (typeof field.max === 'number') schema = schema.max(field.max);
  }
  if (
    field.options &&
    field.options.length > 0 &&
    (field.type === 'select' || field.type === 'multiselect')
  ) {
    const values = field.options.map((o) => o.value);
    if (values.length >= 2) {
      const enumSchema = z.enum(values as [string, ...string[]]);
      schema = field.type === 'multiselect' ? z.array(enumSchema) : enumSchema;
    }
  }

  if (!field.required) {
    schema = schema.optional().nullable();
  }
  return schema;
}

/**
 * @param values Current form values. When supplied, a field whose `visibleWhen`
 *   predicate is false is treated as optional: a rule that applies to only one
 *   shape of record must not block saving another. A PATH redirect has no
 *   `slug`, so a required `slug` would make it unsavable.
 */
export function zodFromFields(
  config: ContentTypeConfig,
  values?: Record<string, unknown>,
): ZodTypeAny {
  if (config.validation) return config.validation;
  const shape: Record<string, ZodTypeAny> = {};
  for (const field of config.fields) {
    if (field.hidden && field.readOnly) continue;
    const conditionallyHidden = !!values && !!field.visibleWhen && !field.visibleWhen(values);
    shape[field.name] = fieldToZod(conditionallyHidden ? { ...field, required: false } : field);
  }
  return z.object(shape).passthrough();
}

export interface ValidationIssue {
  field: string;
  message: string;
}

export function validateAgainstRegistry(
  config: ContentTypeConfig,
  data: Record<string, unknown>,
): { ok: true; data: Record<string, unknown> } | { ok: false; issues: ValidationIssue[] } {
  const schema = zodFromFields(config, data);
  const result = schema.safeParse(data);
  if (result.success) {
    return { ok: true, data: result.data as Record<string, unknown> };
  }
  const issues: ValidationIssue[] = result.error.issues.map((i) => ({
    field: i.path.join('.') || '_root',
    message: i.message,
  }));
  return { ok: false, issues };
}
