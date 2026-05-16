import { describe, it, expect } from 'vitest';
import { fieldToZod, zodFromFields, validateAgainstRegistry } from '../zodFromFields';

describe('zodFromFields', () => {
  it('fieldToZod returns a Zod schema for text', () => {
    const schema = fieldToZod({ name: 't', label: 'T', type: 'text' } as never);
    expect(schema).toBeDefined();
    expect(typeof schema.safeParse).toBe('function');
  });
  it('zodFromFields builds a schema from a config', () => {
    const schema = zodFromFields({ id: 'x', label: { singular: 'X', plural: 'X' }, fields: [] } as never);
    expect(schema).toBeDefined();
  });
  it('validateAgainstRegistry is exported', () => {
    expect(typeof validateAgainstRegistry).toBe('function');
  });
});
