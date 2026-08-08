import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';

import { useMeta } from '../useMeta';

const w = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

describe('useMeta', () => {
  it('should set document title', () => {
    renderHook(() => useMeta({ title: 'Test Page' }), { wrapper: w });
    expect(document.title).toBe('Test Page | Queer Guide');
  });

  it('does not double the site suffix when the title already carries it', () => {
    // routeMeta-convention titles arrive with the suffix so client + edge
    // stay byte-identical.
    renderHook(() => useMeta({ title: 'Plan Trips | Queer Guide' }), { wrapper: w });
    expect(document.title).toBe('Plan Trips | Queer Guide');
  });

  it('keeps a single append when the brand merely appears inside the title', () => {
    renderHook(() => useMeta({ title: 'About Queer Guide' }), { wrapper: w });
    expect(document.title).toBe('About Queer Guide | Queer Guide');
  });
});
