/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('../PWAProvider', () => ({ usePWA: () => ({ canInstall: false, isInstalled: false, promptInstall: vi.fn() }) }));

import { InstallBanner } from '../InstallBanner';

describe('InstallBanner', () => {
  it('renders', () => {
    const { container } = render(<MemoryRouter><InstallBanner /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
