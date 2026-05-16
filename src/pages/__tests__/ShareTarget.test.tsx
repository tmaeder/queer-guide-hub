/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';

const { navigateFn } = vi.hoisted(() => ({ navigateFn: vi.fn() }));

vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => navigateFn }));

import ShareTarget from '../ShareTarget';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/share" element={<ShareTarget />} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => navigateFn.mockReset());

describe('ShareTarget', () => {
  it('navigates to / when no query', () => {
    renderAt('/share');
    expect(navigateFn).toHaveBeenCalledWith('/', { replace: true });
  });

  it('navigates to /search with title query', () => {
    renderAt('/share?title=Pride');
    expect(navigateFn).toHaveBeenCalledWith('/search?q=Pride', { replace: true });
  });

  it('falls back to text when no title', () => {
    renderAt('/share?text=Berlin');
    expect(navigateFn).toHaveBeenCalledWith('/search?q=Berlin', { replace: true });
  });

  it('falls back to url when no title or text', () => {
    renderAt('/share?url=https://x.com');
    expect(navigateFn).toHaveBeenCalledWith('/search?q=https%3A%2F%2Fx.com', { replace: true });
  });
});
