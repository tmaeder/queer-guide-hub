/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useCMSPage', () => ({ useCMSPage: () => ({ data: null, isLoading: false }) }));
vi.mock('@/hooks/useMeta', () => ({ useMeta: vi.fn() }));

import CMSRoutePage from '../CMSRoutePage';

describe('CMSRoutePage', () => {
  it('renders without crashing', () => {
    const { container } = render(<MemoryRouter><CMSRoutePage slug="about" /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
