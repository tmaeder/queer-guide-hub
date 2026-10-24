import { describe, it, expect } from 'vitest';
import { fieldToZod, zodFromFields, validateAgainstRegistry } from '@/lib/cms/zodFromFields';
import { contentTypeRegistry } from '@/config/contentTypeRegistry';
import type { FieldConfig } from '@/types/cms';

const baseField = (overrides: Partial<FieldConfig>): FieldConfig => ({
  name: 'f',
  label: 'F',
  type: 'text',
  group: 'basic',
  ...overrides,
});

describe('fieldToZod', () => {
  it('makes non-required fields optional and nullable', () => {
    const schema = fieldToZod(baseField({ type: 'text' }));
    expect(schema.safeParse(undefined).success).toBe(true);
    expect(schema.safeParse(null).success).toBe(true);
    expect(schema.safeParse('hi').success).toBe(true);
  });

  it('enforces required string', () => {
    const schema = fieldToZod(baseField({ type: 'text', required: true }));
    expect(schema.safeParse(undefined).success).toBe(false);
    expect(schema.safeParse('hi').success).toBe(true);
  });

  it('validates url and email', () => {
    expect(
      fieldToZod(baseField({ type: 'url', required: true })).safeParse('not-a-url').success,
    ).toBe(false);
    expect(
      fieldToZod(baseField({ type: 'url', required: true })).safeParse('https://x.io').success,
    ).toBe(true);
    expect(
      fieldToZod(baseField({ type: 'email', required: true })).safeParse('a@b.co').success,
    ).toBe(true);
    expect(fieldToZod(baseField({ type: 'email', required: true })).safeParse('nope').success).toBe(
      false,
    );
  });

  it('honors min/max for numbers', () => {
    const schema = fieldToZod(baseField({ type: 'number', required: true, min: 1, max: 5 }));
    expect(schema.safeParse(3).success).toBe(true);
    expect(schema.safeParse(0).success).toBe(false);
    expect(schema.safeParse(6).success).toBe(false);
  });

  it('builds enum from select options', () => {
    const schema = fieldToZod(
      baseField({
        type: 'select',
        required: true,
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
      }),
    );
    expect(schema.safeParse('a').success).toBe(true);
    expect(schema.safeParse('c').success).toBe(false);
  });

  it('accepts a blank optional dropdown without accepting unknown choices', () => {
    const field = baseField({
      type: 'select',
      options: [
        { value: 'pending', label: 'Pending' },
        { value: 'verified', label: 'Verified' },
        { value: 'rejected', label: 'Rejected' },
      ],
    });
    const schema = fieldToZod(field);
    for (const value of ['', null, undefined, 'pending', 'verified', 'rejected'])
      expect(schema.safeParse(value).success).toBe(true);
    expect(schema.safeParse('unrecognized').success).toBe(false);
    expect(fieldToZod({ ...field, required: true }).safeParse('').success).toBe(false);
    expect(fieldToZod({ ...field, type: 'multiselect' }).safeParse(['']).success).toBe(false);
  });

  it('lets a tag label save while its optional Verification remains blank', () => {
    const result = validateAgainstRegistry(contentTypeRegistry.unified_tags, {
      name: 'Art',
      verification_status: '',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.verification_status).toBe('');
  });
});

describe('zodFromFields — registry coverage', () => {
  const ids = Object.keys(contentTypeRegistry);

  it.each(ids)('%s — empty object validates (all fields optional by default)', (id) => {
    const config = contentTypeRegistry[id];
    const schema = zodFromFields(config);
    // passthrough means unknown keys are kept; empty payload should validate
    // when no fields are required, but content types with required fields
    // should fail — assert at least one outcome holds.
    const empty = schema.safeParse({});
    const hasRequired = config.fields.some((f) => f.required && !f.readOnly);
    if (hasRequired) {
      expect(empty.success).toBe(false);
    } else {
      expect(empty.success).toBe(true);
    }
  });

  it('passthrough preserves unknown columns', () => {
    const id = ids[0];
    const result = validateAgainstRegistry(contentTypeRegistry[id], {
      _unknown_column_: 'kept',
    });
    if (result.ok) {
      expect((result.data as Record<string, unknown>)._unknown_column_).toBe('kept');
    }
  });
});
