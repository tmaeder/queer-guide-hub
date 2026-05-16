/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { useLocalCtxMock, navigateFn } = vi.hoisted(() => ({
  useLocalCtxMock: vi.fn(),
  navigateFn: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));
vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => navigateFn }));
vi.mock('@/hooks/useTripLocalContext', () => ({ useTripLocalContext: useLocalCtxMock }));

import { TripLocalContext } from '../TripLocalContext';

const trip = { id: 't1' } as never;

beforeEach(() => {
  useLocalCtxMock.mockReset();
  navigateFn.mockReset();
});

describe('TripLocalContext', () => {
  it('renders nothing while loading', () => {
    useLocalCtxMock.mockReturnValue({ data: null, isLoading: true });
    const { container } = render(<TripLocalContext trip={trip} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when both lists empty', () => {
    useLocalCtxMock.mockReturnValue({ data: { personalities: [], villages: [] }, isLoading: false });
    const { container } = render(<TripLocalContext trip={trip} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders personalities section and navigates on click', () => {
    useLocalCtxMock.mockReturnValue({
      data: {
        personalities: [{ id: 'p1', slug: 'marsha', name: 'Marsha P. Johnson', image_url: null, city: { name: 'NYC' } }],
        villages: [],
      },
      isLoading: false,
    });
    render(<TripLocalContext trip={trip} />);
    expect(screen.getByText('Marsha P. Johnson')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Marsha P. Johnson'));
    expect(navigateFn).toHaveBeenCalledWith('/personalities/marsha');
  });

  it('falls back to id when personality has no slug', () => {
    useLocalCtxMock.mockReturnValue({
      data: {
        personalities: [{ id: 'p2', slug: null, name: 'NoSlug', image_url: null }],
        villages: [],
      },
      isLoading: false,
    });
    render(<TripLocalContext trip={trip} />);
    fireEvent.click(screen.getByText('NoSlug'));
    expect(navigateFn).toHaveBeenCalledWith('/personalities/p2');
  });

  it('renders villages section and navigates on click', () => {
    useLocalCtxMock.mockReturnValue({
      data: {
        personalities: [],
        villages: [{ id: 'v1', slug: 'castro', name: 'Castro', description: 'desc', is_featured: true, city: { name: 'SF' } }],
      },
      isLoading: false,
    });
    render(<TripLocalContext trip={trip} />);
    expect(screen.getByText('Castro')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Castro'));
    expect(navigateFn).toHaveBeenCalledWith('/villages/castro');
  });
});
