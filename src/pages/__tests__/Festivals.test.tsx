/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

const ed = (id: string, start: string, n: number | null) => ({
  id,
  slug: `ed-${id}`,
  title: `Edition ${id}`,
  start_date: start,
  end_date: start,
  programme_size: n,
  venue_name: null,
});
const row = (id: string, name: string, type: string, start: string, n: number | null) => {
  const next = ed(id, start, n);
  return {
    festival: {
      id,
      name,
      slug: `slug-${id}`,
      festival_type: type,
      description: null,
      website: null,
      city: 'Berlin',
      country: 'Germany',
      editions: [next],
    },
    next,
  };
};

vi.mock('@/hooks/useMeta', () => ({ useMeta: () => undefined }));
vi.mock('@/hooks/useFestivals', () => ({
  useFestivalDirectory: () => ({
    isLoading: false,
    isError: false,
    data: [
      row('1', 'Folsom Europe', 'fetish', '2027-09-09T10:00:00', 9),
      row('2', 'Berlin Pride', 'pride', '2027-07-24T10:00:00', null),
      {
        ...row('3', 'Running Fest', 'festival', '2020-01-01T10:00:00', 4),
        next: {
          ...row('3', 'x', 'festival', '2020-01-01T10:00:00', 4).next,
          end_date: '2099-01-01T10:00:00',
        },
      },
    ],
  }),
}));

import Festivals from '../Festivals';

function mount() {
  return render(
    <MemoryRouter>
      <Festivals />
    </MemoryRouter>,
  );
}

describe('Festivals hub', () => {
  it('links each brand to its own page', () => {
    mount();
    expect(screen.getByRole('link', { name: 'Folsom Europe' })).toHaveAttribute(
      'href',
      '/festivals/slug-1',
    );
  });

  it('groups by month of the next edition', () => {
    mount();
    expect(screen.getByRole('heading', { name: 'September 2027' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'July 2027' })).toBeInTheDocument();
  });

  it('filters by type', async () => {
    mount();
    // The chip's name carries its count: "Pride 1".
    await userEvent.click(screen.getByRole('button', { name: /^Pride\s*1$/ }));
    expect(screen.queryByRole('link', { name: 'Folsom Europe' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Berlin Pride' })).toBeInTheDocument();
  });

  it('leads with editions that are running today', () => {
    mount();
    expect(screen.getByRole('heading', { name: 'On now' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Running Fest' })).toBeInTheDocument();
  });

  it('searches by name and city, and offers a way back', async () => {
    mount();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search festivals' }), 'folsom');
    expect(screen.getByRole('link', { name: 'Folsom Europe' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Berlin Pride' })).not.toBeInTheDocument();

    await userEvent.clear(screen.getByRole('searchbox', { name: 'Search festivals' }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search festivals' }), 'nowhere');
    expect(screen.getByText('No festivals match this search.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByRole('link', { name: 'Berlin Pride' })).toBeInTheDocument();
  });
});
