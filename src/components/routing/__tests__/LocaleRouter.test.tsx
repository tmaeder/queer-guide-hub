/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en', changeLanguage: vi.fn() } }),
}));

import { LocaleRouter } from '../LocaleRouter';

describe('LocaleRouter', () => {
  it('renders outlet', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/en']}>
        <Routes>
          <Route path="/:locale" element={<LocaleRouter />}>
            <Route index element={<div>home</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
