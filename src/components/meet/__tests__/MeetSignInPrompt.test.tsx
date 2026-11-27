/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
// The Meet nav reads the signed-in user; this prompt is the signed-out case.
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null, loading: false }) }));

import { MeetSignInPrompt } from '../MeetSignInPrompt';

function AuthProbe() {
  const state = useLocation().state as { from?: string } | null;
  return <output data-testid="from">{state?.from ?? 'none'}</output>;
}

describe('MeetSignInPrompt', () => {
  it('names the page and signs in with a return path that keeps the query', () => {
    render(
      <MemoryRouter initialEntries={['/meet/dating?city=x&in=Berlin']}>
        <Routes>
          <Route path="/meet/dating" element={<MeetSignInPrompt title="Dating" />} />
          <Route path="/auth" element={<AuthProbe />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Dating' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: /Sign in/ }));
    expect(screen.getByTestId('from')).toHaveTextContent('/meet/dating?city=x&in=Berlin');
  });
});
