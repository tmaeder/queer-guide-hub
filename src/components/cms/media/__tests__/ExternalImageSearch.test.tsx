/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useExternalImageSearch', () => ({
  useExternalImageSearch: () => ({
    images: [], loading: false, error: null, searchImages: vi.fn(), nextPage: vi.fn(), hasMore: false,
  }),
}));

import ExternalImageSearch from '../ExternalImageSearch';

describe('ExternalImageSearch', () => {
  it('renders', () => {
    const { container } = render(<ExternalImageSearch onSelect={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
