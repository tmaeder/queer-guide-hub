/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string) => fallback,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));
import { LanguageSwitcher } from '../LanguageSwitcher';
import { SUPPORTED_LOCALES } from '@/i18n/languages';
function Location() {
  const location = useLocation();
  return (
    <output aria-label="Location">
      {location.pathname}
      {location.search}
    </output>
  );
}
function setup() {
  render(
    <MemoryRouter initialEntries={['/de/cities?sort=name']}>
      <LanguageSwitcher />
      <Location />
    </MemoryRouter>,
  );
  return userEvent.setup();
}

describe('LanguageSwitcher', () => {
  it('offers every language and preserves the route and query when switching', async () => {
    const user = setup();
    const select = screen.getByRole('combobox', { name: 'Select language' });
    expect(select).toHaveValue('de');
    expect(screen.getAllByRole('option')).toHaveLength(SUPPORTED_LOCALES.length);
    await user.selectOptions(select, 'en');
    expect(select).toHaveValue('en');
    expect(screen.getByLabelText('Location')).toHaveTextContent('/cities?sort=name');
  });

  it('keeps keyboard focus and replaces an existing locale prefix', async () => {
    const user = setup();
    await user.tab();
    const select = screen.getByRole('combobox', { name: 'Select language' });
    expect(select).toHaveFocus();
    await user.selectOptions(select, 'fr');
    expect(select).toHaveValue('fr');
    expect(screen.getByLabelText('Location')).toHaveTextContent('/fr/cities?sort=name');
    await user.selectOptions(select, 'de');
    expect(screen.getByLabelText('Location')).toHaveTextContent('/de/cities?sort=name');
  });
});
