import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SubmissionTypeConfig } from '@/config/submissionRegistry';
import type { FieldConfig } from '@/types/cms';

const contentTypeRegistryMock = vi.hoisted(() => ({} as Record<string, { fields: FieldConfig[] }>));

vi.mock('@/config/contentTypeRegistry', () => ({
  contentTypeRegistry: contentTypeRegistryMock,
  getContentType: (id: string) => contentTypeRegistryMock[id],
}));

import { buildSubmissionSchema } from '../submission/buildSubmissionSchema';

function makeConfig(steps: Array<{ id: string; label: string; fields: string[] }>): SubmissionTypeConfig {
  return {
    id: 'test',
    contentType: 'venues',
    targetTable: 'venues',
    label: 'Test',
    description: '',
    icon: (() => null) as never,
    color: '#000',
    titleField: 'name',
    steps,
  };
}

beforeEach(() => {
  for (const k of Object.keys(contentTypeRegistryMock)) delete contentTypeRegistryMock[k];
});

describe('buildSubmissionSchema — text/select/etc.', () => {
  beforeEach(() => {
    contentTypeRegistryMock.venues = {
      fields: [
        { name: 'name', label: 'Name', type: 'text', required: true } as FieldConfig,
        { name: 'description', label: 'Description', type: 'textarea' } as FieldConfig,
        { name: 'category', label: 'Category', type: 'select' } as FieldConfig,
      ],
    };
  });

  it('returns one stepSchema per config.step', () => {
    const { stepSchemas, fullSchema } = buildSubmissionSchema(
      makeConfig([
        { id: 'a', label: 'A', fields: ['name'] },
        { id: 'b', label: 'B', fields: ['description', 'category'] },
      ]),
    );
    expect(stepSchemas).toHaveLength(2);
    expect(fullSchema).toBeDefined();
  });

  it('flags missing required text as an error', () => {
    const { fullSchema } = buildSubmissionSchema(
      makeConfig([{ id: 'a', label: 'A', fields: ['name'] }]),
    );
    const result = fullSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/required/i);
  });

  it('accepts a non-empty required text', () => {
    const { fullSchema } = buildSubmissionSchema(
      makeConfig([{ id: 'a', label: 'A', fields: ['name'] }]),
    );
    expect(fullSchema.safeParse({ name: 'Berghain' }).success).toBe(true);
  });

  it('passthrough preserves unknown fields', () => {
    const { fullSchema } = buildSubmissionSchema(
      makeConfig([{ id: 'a', label: 'A', fields: ['name'] }]),
    );
    const result = fullSchema.safeParse({ name: 'X', extra: 'unknown', id: 'abc' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).extra).toBe('unknown');
    }
  });
});

describe('buildSubmissionSchema — URL field', () => {
  beforeEach(() => {
    contentTypeRegistryMock.venues = {
      fields: [
        { name: 'website', label: 'Website', type: 'url', required: true } as FieldConfig,
        { name: 'optional_site', label: 'Optional', type: 'url' } as FieldConfig,
      ],
    };
  });

  it('rejects garbage and accepts proper URLs (with auto-protocol)', () => {
    const { fullSchema } = buildSubmissionSchema(
      makeConfig([{ id: 'a', label: 'A', fields: ['website'] }]),
    );
    expect(fullSchema.safeParse({ website: 'not a url' }).success).toBe(false);
    expect(fullSchema.safeParse({ website: 'https://example.com' }).success).toBe(true);
    // ensureProtocol prepends https:// — bare hostname should pass.
    expect(fullSchema.safeParse({ website: 'example.com' }).success).toBe(true);
  });

  it('optional URL accepts empty string', () => {
    const { fullSchema } = buildSubmissionSchema(
      makeConfig([{ id: 'a', label: 'A', fields: ['optional_site'] }]),
    );
    expect(fullSchema.safeParse({ optional_site: '' }).success).toBe(true);
  });
});

describe('buildSubmissionSchema — number / multiselect / images', () => {
  it('coerces strings to numbers for required number fields', () => {
    contentTypeRegistryMock.venues = {
      fields: [{ name: 'price', label: 'Price', type: 'number', required: true } as FieldConfig],
    };
    const { fullSchema } = buildSubmissionSchema(
      makeConfig([{ id: 'a', label: 'A', fields: ['price'] }]),
    );
    const parsed = fullSchema.safeParse({ price: '42' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect((parsed.data as Record<string, number>).price).toBe(42);
    }
  });

  it('multiselect with required=true requires at least one entry', () => {
    contentTypeRegistryMock.venues = {
      fields: [{ name: 'tags', label: 'Tags', type: 'multiselect', required: true } as FieldConfig],
    };
    const { fullSchema } = buildSubmissionSchema(
      makeConfig([{ id: 'a', label: 'A', fields: ['tags'] }]),
    );
    expect(fullSchema.safeParse({ tags: [] }).success).toBe(false);
    expect(fullSchema.safeParse({ tags: ['queer-owned'] }).success).toBe(true);
  });

  it('optional images accept undefined and array', () => {
    contentTypeRegistryMock.venues = {
      fields: [{ name: 'photos', label: 'Photos', type: 'images' } as FieldConfig],
    };
    const { fullSchema } = buildSubmissionSchema(
      makeConfig([{ id: 'a', label: 'A', fields: ['photos'] }]),
    );
    expect(fullSchema.safeParse({}).success).toBe(true);
    expect(fullSchema.safeParse({ photos: ['/x.jpg'] }).success).toBe(true);
  });
});

describe('buildSubmissionSchema — unknown content type', () => {
  it('produces an empty-shape schema when contentType is unknown', () => {
    const { stepSchemas, fullSchema } = buildSubmissionSchema(
      makeConfig([{ id: 'a', label: 'A', fields: ['name'] }]),
    );
    // No venues entry → empty shape; passthrough still accepts arbitrary input.
    expect(stepSchemas[0].safeParse({ anything: 1 }).success).toBe(true);
    expect(fullSchema.safeParse({}).success).toBe(true);
  });
});
