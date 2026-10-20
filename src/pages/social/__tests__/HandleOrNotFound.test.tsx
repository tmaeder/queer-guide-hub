import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

const resolved: { data: unknown; isLoading: boolean } = { data: null, isLoading: false };
vi.mock('@/hooks/useOpenWeb', () => ({ useResolveHandle: () => resolved }));
vi.mock('@/pages/NotFound', () => ({ default: () => <p>not found page</p> }));

import HandleOrNotFound from '../HandleOrNotFound';

function at(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/user/:id" element={<p>profile page</p>} />
        <Route path="*" element={<HandleOrNotFound />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('HandleOrNotFound', () => {
  it('sends a resolved /@handle to the profile', async () => {
    resolved.data = { user_id: 'u1', username: 'alice' };
    at('/@alice');
    expect(await screen.findByText('profile page')).toBeInTheDocument();
  });

  it('shows the 404 for an unknown handle', async () => {
    resolved.data = null;
    at('/@ghost');
    expect(await screen.findByText('not found page')).toBeInTheDocument();
  });

  it('shows the 404 for ordinary unknown paths', async () => {
    resolved.data = { user_id: 'u1' };
    at('/definitely-not-a-route');
    expect(await screen.findByText('not found page')).toBeInTheDocument();
  });
});
