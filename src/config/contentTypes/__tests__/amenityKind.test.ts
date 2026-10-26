import { describe, expect, it } from 'vitest';
import { additionalVocabularies } from '../additionalVocabularies';
import { zodFromFields } from '@/lib/cms/zodFromFields';

const schema = zodFromFields(additionalVocabularies.amenities);

describe('amenity Kind validation', () => {
  it.each(['amenity', 'accessibility', 'queer', 'venue_type'])(
    'accepts the database-supported Kind %s',
    (kind) => {
      expect(schema.safeParse({ name: 'Test amenity', kind }).success).toBe(true);
    },
  );

  it('allows a Gay Bar label edit without changing its stored venue_type Kind', () => {
    const existing = {
      name: 'Gay Bar',
      slug: 'gay-bar',
      kind: 'venue_type',
      category_scope: ['venue'],
      is_active: true,
    };
    const edited = schema.parse({ ...existing, name: 'Gay Bar edited' });

    expect(edited).toEqual({ ...existing, name: 'Gay Bar edited' });
  });

  it('continues rejecting unsupported Kind values', () => {
    const result = schema.safeParse({ name: 'Test amenity', kind: 'unsupported_kind' });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].path).toEqual(['kind']);
  });
});
