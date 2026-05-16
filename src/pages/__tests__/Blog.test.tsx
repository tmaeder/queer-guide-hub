/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));

import Blog from '../Blog';

describe('Blog', () => {
  it('renders without crashing', () => {
    const { container } = render(<MemoryRouter><Blog /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
