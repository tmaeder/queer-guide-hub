/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useMeta', () => ({ useMeta: vi.fn() }));
vi.mock('@/hooks/useCMSPage', () => ({ useCMSPage: () => ({ data: null, isLoading: false }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/useOrganization', () => ({ useOrganizationsList: () => ({ data: [] }) }));

import HelpHotlines from '../HelpHotlines';

describe('HelpHotlines', () => {
  it('renders without crashing', () => {
    const { container } = render(<MemoryRouter><HelpHotlines /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
