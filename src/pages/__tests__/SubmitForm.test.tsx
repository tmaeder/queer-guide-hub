/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('@/hooks/useSubmission', () => ({ useSubmission: () => ({ submit: vi.fn(), loading: false }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/useFlyerScan', () => ({ useFlyerScan: () => ({ scan: vi.fn(), loading: false }) }));
vi.mock('@/hooks/usePageFetchers', () => ({ fetchCountryNameById: vi.fn().mockResolvedValue(null) }));

import SubmitForm from '../SubmitForm';

describe('SubmitForm', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/submit/venue']}>
        <Routes><Route path="/submit/:type" element={<SubmitForm />} /></Routes>
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
