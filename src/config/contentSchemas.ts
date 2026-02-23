/**
 * Content Schemas
 * Dynamic Zod schema generation from the content type registry.
 * Reads FieldConfig[] for any content type and produces a z.ZodObject
 * for validation, form integration, and type safety.
 */

import { z } from 'zod';
import { getContentType } from '@/config/contentTypeRegistry';
import type { FieldConfig, FieldType } from '@/types/cms';

/**
 * Map a single FieldConfig to its corresponding Zod schema.
 */
function fieldToZod(field: FieldConfig): z.ZodTypeAny {
  let schema: z.ZodTypeAny;

  switch (field.type) {
    case 'text':
    case 'url':
    case 'email':
    case 'phone': {
      let s = z.string();

      if (field.type === 'url') {
        s = z.string().url('Must be a valid URL');
      } else if (field.type === 'email') {
        s = z.string().email('Must be a valid email address');
      }

      if (field.required) {
        s = s.min(field.minLength ?? 1, `${field.label} is required`);
      }

      if (field.maxLength !== undefined) {
        s = s.max(field.maxLength, `${field.label} must be at most ${field.maxLength} characters`);
      } else if (field.minLength !== undefined && !field.required) {
        // minLength without required: only enforce if non-empty
        s = s.min(field.minLength, `${field.label} must be at least ${field.minLength} characters`);
      }

      schema = field.required ? s : s.optional().or(z.literal(''));
      break;
    }

    case 'textarea':
    case 'richtext': {
      let s = z.string();

      if (field.required) {
        s = s.min(1, `${field.label} is required`);
      }

      if (field.maxLength !== undefined) {
        s = s.max(field.maxLength, `${field.label} must be at most ${field.maxLength} characters`);
      }

      schema = field.required ? s : s.optional().or(z.literal(''));
      break;
    }

    case 'number': {
      let s = z.number({
        required_error: `${field.label} is required`,
        invalid_type_error: `${field.label} must be a number`,
      });

      if (field.min !== undefined) {
        s = s.min(field.min, `${field.label} must be at least ${field.min}`);
      }

      if (field.max !== undefined) {
        s = s.max(field.max, `${field.label} must be at most ${field.max}`);
      }

      schema = field.required ? s : s.optional().or(z.nan().transform(() => undefined));
      break;
    }

    case 'boolean': {
      schema = z.boolean().optional().default(false);
      break;
    }

    case 'select': {
      if (field.options && field.options.length > 0) {
        const values = field.options.map((o) => o.value);
        // z.enum requires at least 1 element, which we have guaranteed above
        const enumSchema = z.enum(values as [string, ...string[]]);
        schema = field.required
          ? enumSchema
          : enumSchema.optional().or(z.literal(''));
      } else {
        // No options defined: fall back to plain string
        const s = z.string();
        schema = field.required ? s.min(1, `${field.label} is required`) : s.optional().or(z.literal(''));
      }
      break;
    }

    case 'multiselect': {
      const itemSchema =
        field.options && field.options.length > 0
          ? z.enum(field.options.map((o) => o.value) as [string, ...string[]])
          : z.string();

      const arraySchema = z.array(itemSchema);
      schema = field.required
        ? arraySchema.min(1, `${field.label} requires at least one selection`)
        : arraySchema.optional().default([]);
      break;
    }

    case 'date':
    case 'datetime': {
      // Dates are stored/submitted as ISO strings
      let s = z.string();
      if (field.required) {
        s = s.min(1, `${field.label} is required`);
      }
      schema = field.required ? s : s.optional().or(z.literal(''));
      break;
    }

    case 'image': {
      // Single image URL or null
      const urlSchema = z.string().url('Must be a valid URL');
      schema = field.required
        ? urlSchema
        : urlSchema.optional().or(z.literal('')).or(z.null());
      break;
    }

    case 'images': {
      // Array of image URLs
      const arraySchema = z.array(z.string());
      schema = field.required
        ? arraySchema.min(1, `${field.label} requires at least one image`)
        : arraySchema.optional().default([]);
      break;
    }

    case 'location': {
      const locationObj = z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      });
      schema = field.required ? locationObj : locationObj.optional();
      break;
    }

    case 'tags': {
      const tagsSchema = z.array(z.string());
      schema = field.required
        ? tagsSchema.min(1, `${field.label} requires at least one tag`)
        : tagsSchema.optional().default([]);
      break;
    }

    case 'json': {
      const jsonSchema = z.record(z.unknown());
      schema = field.required ? jsonSchema : jsonSchema.optional();
      break;
    }

    default: {
      // Fallback: accept any value
      schema = z.unknown().optional();
      break;
    }
  }

  return schema;
}

/**
 * Generate a Zod schema for a content type by reading its field definitions
 * from the content type registry.
 *
 * @param contentTypeId - ID of the content type (e.g. 'venues', 'events')
 * @returns A compiled z.ZodObject, or throws if the content type is unknown.
 */
export function generateSchema(contentTypeId: string): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const contentType = getContentType(contentTypeId);

  if (!contentType) {
    throw new Error(`Unknown content type: "${contentTypeId}"`);
  }

  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of contentType.fields) {
    // Skip hidden and read-only fields from validation
    if (field.hidden || field.readOnly) continue;
    shape[field.name] = fieldToZod(field);
  }

  return z.object(shape);
}

/**
 * Validation result returned by validateContent.
 */
export interface ContentValidationResult {
  success: boolean;
  errors: Record<string, string>;
  data?: Record<string, unknown>;
}

/**
 * Validate arbitrary data against a content type's generated schema.
 *
 * @param contentTypeId - ID of the content type
 * @param data - Data to validate
 * @returns Object with success flag, error map, and parsed data (on success).
 */
export function validateContent(
  contentTypeId: string,
  data: Record<string, unknown>,
): ContentValidationResult {
  try {
    const schema = generateSchema(contentTypeId);
    // Use passthrough to allow extra fields (like id, created_at, etc.)
    const result = schema.passthrough().safeParse(data);

    if (result.success) {
      return {
        success: true,
        errors: {},
        data: result.data as Record<string, unknown>,
      };
    }

    // Map Zod issues to a field -> message map
    const errors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const fieldName = issue.path.join('.');
      // Only keep first error per field
      if (!errors[fieldName]) {
        errors[fieldName] = issue.message;
      }
    }

    return { success: false, errors };
  } catch (err) {
    return {
      success: false,
      errors: { _form: (err as Error).message },
    };
  }
}
