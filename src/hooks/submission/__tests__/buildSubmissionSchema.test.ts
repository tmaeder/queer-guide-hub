import { describe, it, expect, vi } from 'vitest';

// buildSubmissionSchema resolves fields via contentTypeRegistry[config.contentType].
vi.mock('@/config/contentTypeRegistry', () => ({
  contentTypeRegistry: {
    test: {
      fields: [
        { name: 'title', label: 'Title', type: 'text', required: true, minLength: 3, maxLength: 8 },
        { name: 'count', label: 'Count', type: 'number', min: 1, max: 10 },
        { name: 'email', label: 'Email', type: 'email' },
        { name: 'phone', label: 'Phone', type: 'phone' },
        { name: 'tags', label: 'Tags', type: 'unified_tag' },
        { name: 'tags_req', label: 'Tags', type: 'unified_tag', required: true },
        { name: 'venue_name', label: 'Venue', type: 'venue_autocomplete' },
        { name: 'profession', label: 'Profession', type: 'profession_autocomplete' },
      ],
    },
  },
}));

import { buildSubmissionSchema } from '../buildSubmissionSchema';

function schemaFor() {
  return buildSubmissionSchema({
    contentType: 'test',
    steps: [
      {
        id: 's1',
        label: 'Step',
        fields: ['title', 'count', 'email', 'phone', 'tags', 'venue_name', 'profession'],
      },
    ],
  } as never).fullSchema;
}

function schemaWith(fields: string[]) {
  return buildSubmissionSchema({
    contentType: 'test',
    steps: [{ id: 's1', label: 'Step', fields }],
  } as never).fullSchema;
}

describe('buildSubmissionSchema', () => {
  it('returns a schema for an empty config', () => {
    const schema = buildSubmissionSchema({ contentType: 'missing', steps: [] } as never);
    expect(schema.fullSchema).toBeDefined();
  });

  it('enforces minLength on a required text field', () => {
    expect(schemaFor().safeParse({ title: 'ab' }).success).toBe(false);
    expect(schemaFor().safeParse({ title: 'abc' }).success).toBe(true);
  });

  it('enforces maxLength on a text field', () => {
    expect(schemaFor().safeParse({ title: 'waytoolong' }).success).toBe(false);
  });

  it('enforces numeric min/max range', () => {
    expect(schemaFor().safeParse({ title: 'abc', count: 0 }).success).toBe(false);
    expect(schemaFor().safeParse({ title: 'abc', count: 11 }).success).toBe(false);
    expect(schemaFor().safeParse({ title: 'abc', count: 5 }).success).toBe(true);
  });

  it('validates email format but allows empty (optional)', () => {
    expect(schemaFor().safeParse({ title: 'abc', email: 'nope' }).success).toBe(false);
    expect(schemaFor().safeParse({ title: 'abc', email: 'a@b.co' }).success).toBe(true);
    expect(schemaFor().safeParse({ title: 'abc', email: '' }).success).toBe(true);
  });

  it('validates phone format but allows empty (optional)', () => {
    expect(schemaFor().safeParse({ title: 'abc', phone: 'abc' }).success).toBe(false);
    expect(schemaFor().safeParse({ title: 'abc', phone: '+41 44 123 45 67' }).success).toBe(true);
    expect(schemaFor().safeParse({ title: 'abc', phone: '' }).success).toBe(true);
  });

  it('treats unified_tag as an optional array', () => {
    expect(schemaFor().safeParse({ title: 'abc', tags: ['a', 'b'] }).success).toBe(true);
    expect(schemaFor().safeParse({ title: 'abc' }).success).toBe(true); // tags optional
  });

  it('enforces a required unified_tag (non-empty array)', () => {
    const s = schemaWith(['title', 'tags_req']);
    expect(s.safeParse({ title: 'abc', tags_req: [] }).success).toBe(false);
    expect(s.safeParse({ title: 'abc', tags_req: ['x'] }).success).toBe(true);
  });

  it('treats venue_autocomplete and profession_autocomplete as optional strings', () => {
    expect(schemaFor().safeParse({ title: 'abc', venue_name: 'Club X', profession: 'Artist' }).success).toBe(
      true,
    );
    expect(schemaFor().safeParse({ title: 'abc', venue_name: '' }).success).toBe(true);
  });
});
