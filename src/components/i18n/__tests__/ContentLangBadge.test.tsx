import { describe, it, expect, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import i18n from 'i18next';
import { initReactI18next, I18nextProvider } from 'react-i18next';
import { ContentLangBadge } from '../ContentLangBadge';

beforeAll(async () => {
  if (!i18n.isInitialized) {
    await i18n.use(initReactI18next).init({
      lng: 'en',
      fallbackLng: 'en',
      resources: {
        en: { translation: { common: { contentInLanguage: 'In {{lang}}' } } },
        de: { translation: { common: { contentInLanguage: 'Auf {{lang}}' } } },
      },
      interpolation: { escapeValue: false },
    });
  }
});

function renderWith(lng: string, text: string | null | undefined) {
  i18n.changeLanguage(lng);
  return render(
    <I18nextProvider i18n={i18n}>
      <ContentLangBadge text={text} />
    </I18nextProvider>,
  );
}

describe('ContentLangBadge', () => {
  it('renders a badge when German text appears on EN UI', () => {
    const { container } = renderWith('en', 'Schwule Nacht im Club mit der besten Musik');
    expect(container.textContent).toMatch(/^In /);
  });

  it('renders nothing when German text matches DE UI', () => {
    const { container } = renderWith('de', 'Schwule Nacht im Club mit der besten Musik');
    expect(container.textContent).toBe('');
  });

  it('renders nothing for empty/short text', () => {
    const { container: a } = renderWith('en', '');
    expect(a.textContent).toBe('');
    const { container: b } = renderWith('en', 'hi');
    expect(b.textContent).toBe('');
    const { container: c } = renderWith('en', null);
    expect(c.textContent).toBe('');
  });

  it('renders nothing when English text is on EN UI', () => {
    const { container } = renderWith('en', 'The best party of the year with drinks');
    expect(container.textContent).toBe('');
  });
});
