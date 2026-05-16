/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));

import ExtensionInstall from '../ExtensionInstall';

describe('ExtensionInstall', () => {
  it('renders without crashing', () => {
    const { container } = render(<MemoryRouter><ExtensionInstall /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
