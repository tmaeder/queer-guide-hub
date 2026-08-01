import { describe, it, expect } from 'vitest';
import { fieldToZod, zodFromFields, validateAgainstRegistry } from '../zodFromFields';

describe('zodFromFields', () => {
  it('fieldToZod returns a Zod schema for text', () => {
    const schema = fieldToZod({ name: 't', label: 'T', type: 'text' } as never);
    expect(schema).toBeDefined();
    expect(typeof schema.safeParse).toBe('function');
  });
  it('zodFromFields builds a schema from a config', () => {
    const schema = zodFromFields({
      id: 'x',
      label: { singular: 'X', plural: 'X' },
      fields: [],
    } as never);
    expect(schema).toBeDefined();
  });
  it('validateAgainstRegistry is exported', () => {
    expect(typeof validateAgainstRegistry).toBe('function');
  });
});

describe('array-valued field types', () => {
  // TagsField calls onChange([...]) and every tags column is text[], but the
  // schema grouped 'tags' with the string types. The result was
  // "expected string, received array" blocking the save of any record
  // carrying tags — 32 tags fields in the registry, venue amenities included.
  const tags = { name: 'amenities', label: 'Amenities', type: 'tags' } as never;

  it('accepts the array a tags field emits', () => {
    expect(fieldToZod(tags).safeParse(['wifi', 'wheelchair_accessible']).success).toBe(true);
  });

  it('accepts an empty array, which is what clearing every tag produces', () => {
    expect(fieldToZod(tags).safeParse([]).success).toBe(true);
  });

  it('still rejects a bare string, so the column type stays enforced', () => {
    expect(fieldToZod(tags).safeParse('wifi').success).toBe(false);
  });

  it('treats multiselect and images the same way', () => {
    for (const type of ['multiselect', 'images'] as const) {
      const field = { name: 'f', label: 'F', type } as never;
      expect(fieldToZod(field).safeParse(['a']).success).toBe(true);
    }
  });

  it('leaves the autocompletes as strings — they store a resolved value', () => {
    const city = { name: 'city', label: 'City', type: 'city_autocomplete' } as never;
    expect(fieldToZod(city).safeParse('berlin').success).toBe(true);
  });
});
