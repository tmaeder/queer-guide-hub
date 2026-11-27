/** @vitest-environment jsdom */
import { act, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import en from '@/i18n/locales/en.json';
import de from '@/i18n/locales/de.json';
import type { Personality } from '@/hooks/usePersonalities';
import type { PersonalityEditorial } from '@/lib/personalityEditorial';
import { PersonalityCard } from '../PersonalityCard';
import { PersonalityText } from '../PersonalityText';

const person = {
  id: 'one',
  name: 'Example Person',
  description: 'German singer',
  profession: 'Singer',
  nationality: 'United States',
  is_living: true,
} as Personality;
const verified: PersonalityEditorial = {
  personality_id: 'one',
  connection: 'activist',
  details: null,
  sources: [{ url: 'https://example.org/interview' }],
  translations: {},
};

async function languageInstance(language = 'de') {
  const i18n = createInstance();
  await i18n.init({
    lng: language,
    fallbackLng: 'en',
    resources: { en: { translation: en }, de: { translation: de } },
  });
  return i18n;
}

describe('personality content and locale rendering', () => {
  it('puts a verified community connection on the card, localizes labels and reacts to language switches', async () => {
    const i18n = await languageInstance();
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <PersonalityCard personality={person} editorial={verified} />
        </MemoryRouter>
      </I18nextProvider>,
    );
    expect(screen.getByText('Engagiert sich für LGBTIQ-Rechte')).toBeTruthy();
    expect(screen.getByText('Gesang')).toBeTruthy();
    expect(screen.getByText(/Vereinigte Staaten/)).toBeTruthy();
    expect(screen.queryByText(/United States/)).toBeNull();
    expect(screen.queryByText('German singer')).toBeNull();
    await act(() => i18n.changeLanguage('en'));
    expect(screen.getByText('LGBTIQ rights activist')).toBeTruthy();
    expect(screen.getByText('Singer')).toBeTruthy();
    expect(screen.getByText(/United States/)).toBeTruthy();
  });
  it('labels English fallback descriptions even when too short for language detection', async () => {
    const i18n = await languageInstance();
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <PersonalityCard personality={person} />
        </MemoryRouter>
      </I18nextProvider>,
    );
    expect(screen.getByText('German singer').getAttribute('lang')).toBe('en');
    expect(screen.getByText('Auf Englisch')).toBeTruthy();
  });
  it('uses a translated explanation and marks untranslated biography prose separately', async () => {
    const i18n = await languageInstance();
    render(
      <I18nextProvider i18n={i18n}>
        <PersonalityText
          value="Documented advocacy for the community."
          field="lgbti_details"
          editorial={{
            ...verified,
            translations: { lgbti_details: 'Dokumentiertes Engagement für die Community.' },
          }}
        />
        <PersonalityText
          value="The singer is known for the music and the work in the community."
          field="bio"
        />
      </I18nextProvider>,
    );
    expect(
      screen.getByText('Dokumentiertes Engagement für die Community.').getAttribute('lang'),
    ).toBe('de');
    expect(
      screen
        .getByText('The singer is known for the music and the work in the community.')
        .getAttribute('lang'),
    ).toBe('en');
    expect(screen.getAllByText('Auf Englisch')).toHaveLength(1);
  });
});
