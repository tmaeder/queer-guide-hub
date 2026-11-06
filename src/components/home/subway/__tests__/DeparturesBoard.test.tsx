/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import type { NearYouResult } from '@/hooks/useHomeNearYou';

const { state, refetch } = vi.hoisted(() => ({
  state: { regionLoading: false, isError: false, data: undefined as NearYouResult | undefined },
  refetch: vi.fn(),
}));

vi.mock('@/components/home/homeRegionContext', () => ({
  useHomeRegionContext: () => ({ loading: state.regionLoading }),
}));
vi.mock('@/hooks/useHomeNearYou', () => ({
  useHomeNearYou: () => ({ data: state.data, isLoading: false, isError: state.isError, refetch }),
}));

import { DeparturesBoard } from '../DeparturesBoard';

beforeEach(() => {
  state.regionLoading = false;
  state.isError = false;
  state.data = undefined;
  refetch.mockClear();
});

describe('homepage listings', () => {
  it('does not report an empty board while the region is resolving', () => {
    state.regionLoading = true;
    const { container } = renderWithProviders(<DeparturesBoard showRegionPicker={false} />);
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(screen.queryByText(/no listings found/i)).not.toBeInTheDocument();
  });

  it('keeps cached worldwide listings usable after a failed refresh and offers retry', () => {
    state.isError = true;
    state.data = {
      scope: 'network',
      localCount: 0,
      tripCount: 1,
      rows: [
        {
          kind: 'event',
          id: '1',
          slug: 'pride',
          title: 'Pride',
          via: 'Berlin',
          rung: 'trip',
          startDate: null,
        },
      ],
    };

    renderWithProviders(<DeparturesBoard showRegionPicker={false} />);
    expect(screen.getByRole('heading', { name: 'Places and events' })).toBeInTheDocument();
    expect(screen.getByText('Worldwide')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Pride Berlin' })).toHaveAttribute('href', '/events/pride');
    expect(screen.getByRole('status')).toHaveTextContent('Couldn’t refresh these results.');
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalledOnce();
  });
});
