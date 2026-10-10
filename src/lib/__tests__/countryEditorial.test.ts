import { describe, expect, it } from 'vitest';
import { localizedCountryField, publishedCountryEditorial } from '../countryEditorial';

const country = {
  name: 'Germany',
  name_i18n: { de: 'Deutschland' },
  description: 'English description',
  description_i18n: { de: 'Deutsche Beschreibung' },
  editorial_hook: 'Berlin and beyond',
  enrichment_status: { editorial: { state: 'published' } },
};

describe('country editorial publication contract', () => {
  it('uses exact/base locale and then English', () => {
    expect(localizedCountryField('English', { 'pt-BR': 'Brasil', pt: 'Português' }, 'pt-BR')).toBe(
      'Brasil',
    );
    expect(localizedCountryField('English', { pt: 'Português' }, 'pt-PT')).toBe('Português');
    expect(localizedCountryField('English', {}, 'ja')).toBe('English');
  });

  it('renders approved localized prose', () => {
    expect(publishedCountryEditorial(country, 'de-DE')).toEqual({
      name: 'Deutschland',
      hook: 'Berlin and beyond',
      description: 'Deutsche Beschreibung',
      published: true,
    });
  });

  it('fails closed for review-state copy', () => {
    expect(
      publishedCountryEditorial(
        {
          ...country,
          enrichment_status: { editorial: { state: 'review' } },
        },
        'de',
      ),
    ).toEqual({
      name: 'Deutschland',
      hook: null,
      description: null,
      published: false,
    });
  });
});
