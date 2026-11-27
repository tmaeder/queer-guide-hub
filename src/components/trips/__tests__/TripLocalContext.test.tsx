/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { useLocalCtxMock } = vi.hoisted(() => ({ useLocalCtxMock: vi.fn() }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));
// Plain anchors stand in for the localized link; the href is what matters.
vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/hooks/useTripLocalContext', () => ({ useTripLocalContext: useLocalCtxMock }));

import { TripLocalContext } from '../TripLocalContext';

const trip = { id: 't1' } as never;

beforeEach(() => {
  useLocalCtxMock.mockReset();
});

describe('TripLocalContext', () => {
  it('renders nothing while loading', () => {
    useLocalCtxMock.mockReturnValue({ data: null, isLoading: true });
    const { container } = render(<TripLocalContext trip={trip} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when both lists empty', () => {
    useLocalCtxMock.mockReturnValue({
      data: { personalities: [], villages: [] },
      isLoading: false,
    });
    const { container } = render(<TripLocalContext trip={trip} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders personalities section and links to the entity page', () => {
    useLocalCtxMock.mockReturnValue({
      data: {
        personalities: [
          {
            id: 'p1',
            slug: 'marsha',
            name: 'Marsha P. Johnson',
            image_url: null,
            city: { name: 'NYC' },
          },
        ],
        villages: [],
      },
      isLoading: false,
    });
    render(<TripLocalContext trip={trip} />);
    expect(screen.getByText('Marsha P. Johnson')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Marsha P. Johnson/ })).toHaveAttribute(
      'href',
      '/personalities/marsha',
    );
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
    expect(screen.getByRole('link', { name: /NoSlug/ })).toHaveAttribute(
      'href',
      '/personalities/p2',
    );
  });

  it('renders villages section and links to the entity page', () => {
    useLocalCtxMock.mockReturnValue({
      data: {
        personalities: [],
        villages: [
          {
            id: 'v1',
            slug: 'castro',
            name: 'Castro',
            description: 'desc',
            is_featured: true,
            city: { name: 'SF' },
          },
        ],
      },
      isLoading: false,
    });
    render(<TripLocalContext trip={trip} />);
    expect(screen.getByText('Castro')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Castro/ })).toHaveAttribute(
      'href',
      '/villages/castro',
    );
  });
});
