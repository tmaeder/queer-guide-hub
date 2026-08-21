/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router';
import { AuthAliasRedirect } from '../AuthAliasRedirect';

function AuthProbe() {
  const { pathname, search, hash } = useLocation();
  return <div data-testid="landed">{`${pathname}${search}${hash}`}</div>;
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/signin" element={<AuthAliasRedirect />} />
        <Route path="/login" element={<AuthAliasRedirect />} />
        <Route path="/auth" element={<AuthProbe />} />
      </Routes>
    </MemoryRouter>,
  );

describe('AuthAliasRedirect', () => {
  it('forwards /signin to /auth', () => {
    renderAt('/signin');
    expect(screen.getByTestId('landed')).toHaveTextContent('/auth');
  });

  it('forwards /login to /auth', () => {
    renderAt('/login');
    expect(screen.getByTestId('landed')).toHaveTextContent('/auth');
  });

  it('PRESERVES the query string', () => {
    // The whole reason this component exists instead of <Navigate to="/auth">:
    // a bare Navigate drops location.search, discarding the ?redirect= these
    // aliases are used to carry.
    renderAt('/signin?redirect=%2Ftravel');
    expect(screen.getByTestId('landed')).toHaveTextContent('/auth?redirect=%2Ftravel');
  });

  it('preserves the deprecated ?next= alias too', () => {
    renderAt('/signin?next=%2Ftravel');
    expect(screen.getByTestId('landed')).toHaveTextContent('/auth?next=%2Ftravel');
  });

  it('preserves the hash', () => {
    renderAt('/login?redirect=%2Fhub#section');
    expect(screen.getByTestId('landed')).toHaveTextContent('/auth?redirect=%2Fhub#section');
  });
});
