/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useCMSPage', () => ({ useCMSPage: () => ({ data: null, isLoading: false }) }));
vi.mock('@/hooks/useUserCountry', () => ({
  useUserCountry: () => ({ country: 'US', setCountry: vi.fn() }),
  SUPPORTED_COUNTRIES: ['US', 'GB'],
  countryLabel: (c: string) => c,
}));
vi.mock('@/components/routing/LocalizedLink', () => ({ LocalizedLink: ({ children }: { children: ReactNode }) => <span>{children}</span> }));

import { CrisisStrip } from '../CrisisStrip';

describe('CrisisStrip', () => {
  it('renders without crashing', () => {
    const { container } = render(<MemoryRouter><CrisisStrip /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
