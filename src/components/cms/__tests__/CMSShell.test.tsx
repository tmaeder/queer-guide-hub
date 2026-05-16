/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useCMSShortcuts', () => ({ useCMSShortcuts: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/usePageFetchers', () => ({ countRows: vi.fn().mockResolvedValue(0), listFrom: vi.fn().mockResolvedValue([]), listFromIn: vi.fn().mockResolvedValue([]) }));

import { CMSShell } from '../CMSShell';

describe('CMSShell', () => {
  it('renders without crashing', () => {
    const { container } = render(<MemoryRouter><CMSShell /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
