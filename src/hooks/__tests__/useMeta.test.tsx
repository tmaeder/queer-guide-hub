import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';

import { useMeta } from '../useMeta';

const w = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

describe('useMeta', () => {
  it('should set document title', () => {
    renderHook(() => useMeta({ title: 'Test Page' }), { wrapper: w });
    expect(document.title).toContain('Test Page');
  });
});
