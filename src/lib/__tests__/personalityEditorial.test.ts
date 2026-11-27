import { describe, expect, it } from 'vitest';
import {
  localizedPersonalityField,
  publicConnection,
  type PersonalityEditorial,
} from '../personalityEditorial';
import { auditPersonality } from '../../../scripts/data-quality/audit-personality-editorial';

const editorial: PersonalityEditorial = {
  personality_id: 'one',
  connection: 'activist',
  details: 'Documented advocacy.',
  sources: [{ url: 'https://example.org/interview' }],
  translations: { bio: 'Eine Biografie auf Deutsch.' },
};

describe('personality editorial content', () => {
  it('does not promote raw or unsupported connection categories', () => {
    expect(publicConnection()).toBeUndefined();
    expect(
      publicConnection({ ...editorial, details: null, connection: 'constructor' }),
    ).toBeUndefined();
    expect(publicConnection({ ...editorial, sources: [] })).toBeUndefined();
    expect(
      publicConnection({ ...editorial, details: null, connection: 'none_known' }),
    ).toBeUndefined();
  });
  it('allows a verified cultural explanation without claiming community membership', () => {
    expect(publicConnection({ ...editorial, connection: 'none_known' })).toEqual({
      category: undefined,
      details: 'Documented advocacy.',
      sources: ['https://example.org/interview'],
    });
  });
  it('rejects executable source links', () => {
    expect(
      publicConnection({ ...editorial, sources: [{ url: 'javascript:alert(1)' }] }),
    ).toBeUndefined();
  });
  it('uses regional-locale translations and labels fallback prose with its detected language', () => {
    expect(
      localizedPersonalityField('An English biography of the singer.', 'bio', 'de-CH', editorial),
    ).toEqual({ text: editorial.translations.bio, language: 'de' });
    expect(localizedPersonalityField('An English biography of the singer.', 'bio', 'fr')).toEqual({
      text: 'An English biography of the singer.',
      language: 'en',
    });
  });
  it('publishes only reviewed sidecar translations and ignores raw inline maps', () => {
    expect(
      localizedPersonalityField(
        'Original',
        'description',
        'de',
        { ...editorial, translations: { description: 'Geprüfte Beschreibung' } },
        { de: 'Other' },
      ).text,
    ).toBe('Geprüfte Beschreibung');
    expect(
      localizedPersonalityField('Original', 'description', 'de', undefined, { de: 42 }).text,
    ).toBe('Original');
    expect(
      localizedPersonalityField('Original', 'description', 'de', undefined, {
        de: 'Unreviewed translation',
        en: 'Unreviewed canonical replacement',
      }).text,
    ).toBe('Original');
  });
  it('flags missing explanations and mixed-language prose for review without assigning an identity', () => {
    const result = auditPersonality({
      id: 'one',
      name: 'Example',
      bio: 'The artist is known for the music and the work with the community in the city.\nDie Person ist für die Arbeit mit der Gemeinschaft und für die Kunst in der Stadt bekannt.',
    });
    expect(result.issues).toContain('missing_connection_explanation');
    expect(result.issues).toContain('bio_possibly_mixed_languages');
    expect(result).not.toHaveProperty('lgbti_connection');
  });
});
