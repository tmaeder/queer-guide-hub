/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { expect, it, vi } from 'vitest';
import de from '@/i18n/locales/de.json';
import en from '@/i18n/locales/en.json';
vi.mock('@/components/admin/inline/Editable', () => ({
  Editable: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/admin/AdminEditButton', () => ({ AdminEditButton: () => null }));
vi.mock('@/components/moderation/ReportButton', () => ({ ReportButton: () => null }));
vi.mock('@/components/share/ShareMenu', () => ({
  ShareMenu: ({ text }: { text: string }) => <button data-testid="share-text">{text}</button>,
}));
vi.mock('@/hooks/usePersonalityRelated', () => ({
  usePersonalityRelated: () => ({ news: [], events: [], loading: false }),
}));
import { PersonalityHero, transformPersonality } from '../PersonalityDetail.parts';

it('renders the reviewed profession while keeping the canonical profession in its filter', async () => {
  const i18n = createInstance();
  await i18n.init({
    lng: 'de',
    fallbackLng: 'en',
    resources: { en: { translation: en }, de: { translation: de } },
  });
  const onProfessionClick = vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <PersonalityHero
          personality={transformPersonality({
            id: 'composer',
            name: 'Reviewed Composer',
            profession: 'Composer',
            visibility: 'public',
          })}
          countryId={null}
          onProfessionClick={onProfessionClick}
          editorial={{
            personality_id: 'composer',
            connection: null,
            details: null,
            sources: [],
            translations: { profession: 'Komponist' },
          }}
        />
      </MemoryRouter>
    </I18nextProvider>,
  );
  const link = screen.getByRole('link', { name: 'Komponist' });
  expect(link).toHaveAttribute('href', '/personalities?profession=Composer');
  expect(screen.queryByText('Composer')).toBeNull();
  fireEvent.click(link);
  expect(onProfessionClick).toHaveBeenCalledWith('Composer');
});

it('uses the published German summary in the hero and share text and translates the age', async () => {
  const i18n = createInstance();
  await i18n.init({
    lng: 'de',
    fallbackLng: 'en',
    resources: { en: { translation: en }, de: { translation: de } },
  });
  const person = transformPersonality({
    id: 'p1',
    name: 'Example Person',
    description: 'English source summary',
    bio: 'English source biography',
    profession: 'Actor',
    birth_date: '1987-02-21',
    is_living: true,
    visibility: 'public',
  });
  render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <PersonalityHero
          personality={person}
          countryId={null}
          onProfessionClick={vi.fn()}
          editorial={{
            personality_id: 'p1',
            connection: null,
            details: null,
            sources: [],
            translations: { description: 'Geprüfte deutsche Zusammenfassung.' },
          }}
        />
      </MemoryRouter>
    </I18nextProvider>,
  );
  expect(screen.getByText('Geprüfte deutsche Zusammenfassung.', { selector: 'p' })).toHaveAttribute(
    'lang',
    'de',
  );
  expect(screen.getByTestId('share-text')).toHaveTextContent('Geprüfte deutsche Zusammenfassung.');
  expect(screen.queryByText('English source biography')).toBeNull();
  expect(screen.getByText(/Alter: \d+ Jahre/)).toBeInTheDocument();
});

it('keeps an unknown living status neutral and localizes the country chip', async () => {
  const i18n = createInstance();
  await i18n.init({
    lng: 'de',
    fallbackLng: 'en',
    resources: { en: { translation: en }, de: { translation: de } },
  });
  render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <PersonalityHero
          personality={transformPersonality({
            id: 'p2',
            name: 'Reviewed Actor',
            birth_date: '1947-03-07',
            is_living: null,
            nationality: 'United States',
            visibility: 'public',
          })}
          countryId={null}
          onProfessionClick={vi.fn()}
        />
      </MemoryRouter>
    </I18nextProvider>,
  );
  expect(screen.getByText('Vereinigte Staaten')).toBeInTheDocument();
  expect(screen.getByText('Geboren 1947')).toBeInTheDocument();
  expect(screen.queryByText(/Historisch|Alter:/)).toBeNull();
});

it('omits a life-status label when both status and dates are unknown', async () => {
  const i18n = createInstance();
  await i18n.init({ lng: 'en', resources: { en: { translation: en } } });
  render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <PersonalityHero
          personality={transformPersonality({
            id: 'p3',
            name: 'Undated Person',
            is_living: null,
            visibility: 'public',
          })}
          countryId={null}
          onProfessionClick={vi.fn()}
        />
      </MemoryRouter>
    </I18nextProvider>,
  );
  expect(screen.queryByText(/Historical|Living|Age:/)).toBeNull();
});
