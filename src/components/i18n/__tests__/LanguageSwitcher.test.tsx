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
  it('opens every language on the first click and preserves the route and query when switching', async () => {
    const user = setup();
    const trigger = screen.getByRole('combobox', { name: 'Select language' });
    expect(trigger).toHaveTextContent('Deutsch');
    await user.click(trigger);
    expect(screen.getAllByRole('option')).toHaveLength(SUPPORTED_LOCALES.length);
    await user.click(screen.getByRole('option', { name: 'English' }));
    expect(trigger).toHaveTextContent('English');
    expect(screen.getByLabelText('Location')).toHaveTextContent('/cities?sort=name');
  });

  it('supports language typeahead before the first menu opening', async () => {
    const user = setup();
    await user.tab();
    await user.keyboard('e');
    expect(screen.getByRole('combobox')).toHaveTextContent('English');
    expect(screen.getByLabelText('Location')).toHaveTextContent('/cities?sort=name');
  });
});
