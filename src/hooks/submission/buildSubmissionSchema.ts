/**
 * Derive Zod schemas from a SubmissionTypeConfig.
 * One schema per step (for `form.trigger(stepFieldNames)`) plus a full-form schema.
 */

import { z, type ZodTypeAny } from 'zod';
import type { SubmissionTypeConfig } from '@/config/submissionRegistry';
import { contentTypeRegistry } from '@/config/contentTypeRegistry';
import type { FieldConfig } from '@/types/cms';
import { ensureProtocol, isValidHttpUrl } from '@/utils/url';

function schemaForField(field: FieldConfig): ZodTypeAny {
  const { type, required, label, minLength, maxLength, min, max } = field;
  const requiredMsg = `${label} is required`;

  // Apply declarative FieldConfig length constraints + an optional format refine
  // (email/phone). minLength/maxLength were previously UI hints only.
  const decorate = (s: z.ZodString, refine?: (s: z.ZodString) => z.ZodString): z.ZodString => {
    let out = s;
    if (typeof minLength === 'number') {
      out = out.min(minLength, `${label} must be at least ${minLength} characters`);
    }
    if (typeof maxLength === 'number') {
      out = out.max(maxLength, `${label} must be at most ${maxLength} characters`);
    }
    return refine ? refine(out) : out;
  };

  const stringish = (refine?: (s: z.ZodString) => z.ZodString): ZodTypeAny => {
    const base = z.string({ invalid_type_error: requiredMsg });
    if (required) {
      return decorate(base.min(1, requiredMsg), refine);
    }
    // Optional: empty string passes; any actual value must satisfy the constraints.
    return decorate(base, refine).optional().or(z.literal(''));
  };

  switch (type) {
    case 'text':
    case 'textarea':
    case 'richtext':
    case 'select':
    case 'date':
    case 'datetime':
    case 'city_autocomplete':
    case 'country_autocomplete':
    case 'venue_autocomplete':
    case 'profession_autocomplete':
    case 'location':
      return stringish();

    case 'email':
      return stringish((s) => s.email(`${label} must be a valid email address`));

    case 'phone':
      return stringish((s) =>
        s.regex(/^[+()\d\s./-]{6,}$/, `${label} must be a valid phone number`),
      );

    case 'url': {
      const urlCheck = (v: unknown) => {
        if (typeof v !== 'string' || !v.trim()) return !required;
        return isValidHttpUrl(ensureProtocol(v) as string);
      };
      return z
        .any()
        .refine(urlCheck, { message: 'Please enter a full valid URL like https://example.com' });
    }

    case 'number': {
      const withRange = (n: z.ZodNumber): z.ZodNumber => {
        let out = n;
        if (typeof min === 'number') out = out.min(min, `${label} must be at least ${min}`);
        if (typeof max === 'number') out = out.max(max, `${label} must be at most ${max}`);
        return out;
      };
      return required
        ? withRange(z.coerce.number({ invalid_type_error: requiredMsg }))
        : z
            .union([withRange(z.coerce.number()), z.literal(''), z.null(), z.undefined()])
            .optional();
    }

    case 'boolean':
      return z.boolean().optional();

    case 'multiselect':
    case 'tags':
    case 'unified_tag':
    case 'roles_autocomplete':
    case 'images':
      return required
        ? z.array(z.any()).min(1, requiredMsg)
        : z.array(z.any()).optional();

    case 'image':
    case 'json':
    default:
      return z.any().optional();
  }
}

function fieldsFor(config: SubmissionTypeConfig): FieldConfig[] {
  return contentTypeRegistry[config.contentType]?.fields ?? [];
}

function shapeForFields(stepFieldNames: string[], fields: FieldConfig[]) {
  const shape: Record<string, ZodTypeAny> = {};
  for (const name of stepFieldNames) {
    const fc = fields.find((f) => f.name === name);
    if (!fc) continue;
    shape[name] = schemaForField(fc);
  }
  return shape;
}

export function buildSubmissionSchema(config: SubmissionTypeConfig) {
  const fields = fieldsFor(config);

  const stepSchemas = config.steps.map((step) =>
    z.object(shapeForFields(step.fields, fields)).passthrough(),
  );

  const allFieldNames = config.steps.flatMap((s) => s.fields);
  const fullSchema = z.object(shapeForFields(allFieldNames, fields)).passthrough();

  return { stepSchemas, fullSchema };
}
