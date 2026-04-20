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
  const { type, required, label } = field;
  const requiredMsg = `${label} is required`;

  const stringish = (extra?: (s: z.ZodString) => ZodTypeAny): ZodTypeAny => {
    const base = z.string({ invalid_type_error: requiredMsg });
    if (required) {
      const req = base.min(1, requiredMsg);
      return extra ? extra(req as z.ZodString) : req;
    }
    const opt = base.optional().or(z.literal(''));
    return extra ? extra(base as z.ZodString).optional().or(z.literal('')) : opt;
  };

  switch (type) {
    case 'text':
    case 'textarea':
    case 'richtext':
    case 'email':
    case 'phone':
    case 'select':
    case 'date':
    case 'datetime':
    case 'city_autocomplete':
    case 'country_autocomplete':
    case 'location':
      return stringish();

    case 'url': {
      const urlCheck = (v: unknown) => {
        if (typeof v !== 'string' || !v.trim()) return !required;
        return isValidHttpUrl(ensureProtocol(v) as string);
      };
      return z
        .any()
        .refine(urlCheck, { message: 'Please enter a full valid URL like https://example.com' });
    }

    case 'number':
      return required
        ? z.coerce.number({ invalid_type_error: requiredMsg })
        : z
            .union([z.coerce.number(), z.literal(''), z.null(), z.undefined()])
            .optional();

    case 'boolean':
      return z.boolean().optional();

    case 'multiselect':
    case 'tags':
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
