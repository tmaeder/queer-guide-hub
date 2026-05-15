import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { FieldConfig } from '@/types/cms';

const getContentTypeMock = vi.hoisted(() => vi.fn());

vi.mock('@/config/contentTypeRegistry', () => ({
  getContentType: getContentTypeMock,
}));

import { generateSchema, validateContent } from '../contentSchemas';

function setFields(fields: FieldConfig[]) {
  getContentTypeMock.mockReturnValue({ id: 'test', fields });
}

beforeEach(() => {
  getContentTypeMock.mockReset();
});

describe('generateSchema', () => {
  it('throws when the content type is unknown', () => {
    getContentTypeMock.mockReturnValue(undefined);
    expect(() => generateSchema('nope')).toThrow(/Unknown content type/);
  });

  it('skips hidden and readOnly fields', () => {
    setFields([
      { name: 'name', label: 'Name', type: 'text', required: true } as FieldConfig,
      { name: 'created_at', label: 'Created', type: 'text', hidden: true } as FieldConfig,
      { name: 'id', label: 'ID', type: 'text', readOnly: true } as FieldConfig,
    ]);

    const schema = generateSchema('test');
    expect(Object.keys(schema.shape)).toEqual(['name']);
  });
});

describe('validateContent — text/url/email/phone', () => {
  it('rejects missing required text', () => {
    setFields([{ name: 'name', label: 'Name', type: 'text', required: true } as FieldConfig]);
    const r = validateContent('test', { name: '' });
    expect(r.success).toBe(false);
    expect(r.errors.name).toMatch(/required/i);
  });

  it('validates URL format', () => {
    setFields([{ name: 'url', label: 'URL', type: 'url', required: true } as FieldConfig]);
    expect(validateContent('test', { url: 'not-a-url' }).success).toBe(false);
    expect(validateContent('test', { url: 'https://example.com' }).success).toBe(true);
  });

  it('validates email format', () => {
    setFields([{ name: 'em', label: 'Email', type: 'email', required: true } as FieldConfig]);
    expect(validateContent('test', { em: 'plain' }).success).toBe(false);
    expect(validateContent('test', { em: 'a@b.co' }).success).toBe(true);
  });

  it('enforces maxLength on text', () => {
    setFields([{ name: 'n', label: 'N', type: 'text', maxLength: 3, required: true } as FieldConfig]);
    expect(validateContent('test', { n: 'four' }).success).toBe(false);
    expect(validateContent('test', { n: 'foo' }).success).toBe(true);
  });

  it('allows empty string for non-required text', () => {
    setFields([{ name: 'opt', label: 'Opt', type: 'text' } as FieldConfig]);
    expect(validateContent('test', { opt: '' }).success).toBe(true);
  });
});

describe('validateContent — number', () => {
  it('validates min/max', () => {
    setFields([{ name: 'age', label: 'Age', type: 'number', required: true, min: 18, max: 120 } as FieldConfig]);
    expect(validateContent('test', { age: 17 }).success).toBe(false);
    expect(validateContent('test', { age: 121 }).success).toBe(false);
    expect(validateContent('test', { age: 30 }).success).toBe(true);
  });

  it('rejects non-numeric when required', () => {
    setFields([{ name: 'n', label: 'N', type: 'number', required: true } as FieldConfig]);
    expect(validateContent('test', { n: 'thirty' }).success).toBe(false);
  });
});

describe('validateContent — boolean / select / multiselect', () => {
  it('defaults boolean to false when missing', () => {
    setFields([{ name: 'flag', label: 'Flag', type: 'boolean' } as FieldConfig]);
    const r = validateContent('test', {});
    expect(r.success).toBe(true);
    expect(r.data?.flag).toBe(false);
  });

  it('enforces select against the option list', () => {
    setFields([{
      name: 'cat', label: 'Cat', type: 'select', required: true,
      options: [{ value: 'bar', label: 'Bar' }, { value: 'club', label: 'Club' }],
    } as FieldConfig]);
    expect(validateContent('test', { cat: 'restaurant' }).success).toBe(false);
    expect(validateContent('test', { cat: 'bar' }).success).toBe(true);
  });

  it('falls back to plain string when select has no options', () => {
    setFields([{ name: 'cat', label: 'Cat', type: 'select', required: true, options: [] } as FieldConfig]);
    expect(validateContent('test', { cat: 'anything' }).success).toBe(true);
    expect(validateContent('test', { cat: '' }).success).toBe(false);
  });

  it('multiselect requires at least one when required', () => {
    setFields([{
      name: 'tags', label: 'Tags', type: 'multiselect', required: true,
      options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }],
    } as FieldConfig]);
    expect(validateContent('test', { tags: [] }).success).toBe(false);
    expect(validateContent('test', { tags: ['a'] }).success).toBe(true);
  });

  it('multiselect defaults to [] when not required', () => {
    setFields([{ name: 'tags', label: 'Tags', type: 'multiselect' } as FieldConfig]);
    const r = validateContent('test', {});
    expect(r.success).toBe(true);
    expect(r.data?.tags).toEqual([]);
  });
});

describe('validateContent — image / images', () => {
  it('image requires a valid URL when required', () => {
    setFields([{ name: 'cover', label: 'Cover', type: 'image', required: true } as FieldConfig]);
    expect(validateContent('test', { cover: 'nope' }).success).toBe(false);
    expect(validateContent('test', { cover: 'https://x.png' }).success).toBe(true);
  });

  it('images array requires at least one when required', () => {
    setFields([{ name: 'gallery', label: 'Gallery', type: 'images', required: true } as FieldConfig]);
    expect(validateContent('test', { gallery: [] }).success).toBe(false);
    expect(validateContent('test', { gallery: ['/x.png'] }).success).toBe(true);
  });
});

describe('validateContent — location / tags / json', () => {
  it('location validates lat/lng ranges', () => {
    setFields([{ name: 'loc', label: 'Loc', type: 'location', required: true } as FieldConfig]);
    expect(validateContent('test', { loc: { lat: 95, lng: 0 } }).success).toBe(false);
    expect(validateContent('test', { loc: { lat: 52, lng: 13 } }).success).toBe(true);
  });

  it('tags defaults to [] when not required', () => {
    setFields([{ name: 't', label: 'T', type: 'tags' } as FieldConfig]);
    const r = validateContent('test', {});
    expect(r.success).toBe(true);
    expect(r.data?.t).toEqual([]);
  });

  it('json accepts an arbitrary object', () => {
    setFields([{ name: 'meta', label: 'Meta', type: 'json' } as FieldConfig]);
    expect(validateContent('test', { meta: { a: 1, b: 'x' } }).success).toBe(true);
  });
});

describe('validateContent — passthrough behaviour', () => {
  it('preserves extra fields not in the schema', () => {
    setFields([{ name: 'name', label: 'Name', type: 'text', required: true } as FieldConfig]);
    const r = validateContent('test', { name: 'X', id: 'unrelated', created_at: 'now' });
    expect(r.success).toBe(true);
    expect(r.data?.id).toBe('unrelated');
    expect(r.data?.created_at).toBe('now');
  });

  it("returns _form error when the content type isn't found", () => {
    getContentTypeMock.mockReturnValue(undefined);
    const r = validateContent('nope', { name: 'X' });
    expect(r.success).toBe(false);
    expect(r.errors._form).toMatch(/Unknown content type/);
  });

  it('returns one error per field on multiple failures', () => {
    setFields([
      { name: 'a', label: 'A', type: 'text', required: true } as FieldConfig,
      { name: 'b', label: 'B', type: 'number', required: true, min: 10 } as FieldConfig,
    ]);
    const r = validateContent('test', { a: '', b: 5 });
    expect(r.success).toBe(false);
    expect(r.errors.a).toBeDefined();
    expect(r.errors.b).toBeDefined();
  });
});
