/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import SubmitForm from '../SubmitForm';

describe('SubmitForm', () => {
  it('shows the graceful fallback for an unknown submission type', () => {
    const { getByText } = render(
      <MemoryRouter initialEntries={['/submit/zzinvalid']}>
        <Routes>
          <Route path="/submit/:contentType" element={<SubmitForm />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(getByText('Unknown submission type')).toBeTruthy();
  });

  it('derives the content type from the path when there is no :contentType param', () => {
    // The explicit submit/news + submit/feedback routes (routes.tsx) carry no
    // :contentType param, so SubmitForm must read the last path segment. An unknown
    // segment still resolves to the fallback rather than crashing on an undefined type.
    const { getByText } = render(
      <MemoryRouter initialEntries={['/submit/zzinvalid']}>
        <Routes>
          {/* static route → no :contentType param, mirrors submit/news in routes.tsx */}
          <Route path="/submit/zzinvalid" element={<SubmitForm />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(getByText('Unknown submission type')).toBeTruthy();
  });
});
