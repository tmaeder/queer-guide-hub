/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/hooks/useGeoLink', () => ({
  useGeoLink: () => ({
    loading: false, result: null, batchAllResult: null,
    unlinkedCounts: {}, batchLink: vi.fn(),
    batchLinkAll: vi.fn(), getUnlinkedCounts: vi.fn(),
  }),
}));

import BatchGeoLinkDialog from '../BatchGeoLinkDialog';

describe('BatchGeoLinkDialog', () => {
  it('renders trigger button', () => {
    render(<BatchGeoLinkDialog />);
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
  });
});
