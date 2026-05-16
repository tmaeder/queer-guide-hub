/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VenueCard } from '../VenueCard';

const venue = {
  name: 'Pride Bar', category: 'bar', city: 'Berlin', state: 'BE',
  price_range: 2, description: 'A nice bar', phone: '123',
  email: 'a@b', website: 'https://x', tags: ['queer', 'bar', 'dance', 'fourth'],
  is_featured: true, verified: true,
} as never;

describe('admin/VenueCard', () => {
  it('renders name + category + price', () => {
    render(<VenueCard venue={venue} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('Pride Bar')).toBeInTheDocument();
    expect(screen.getAllByText('bar').length).toBeGreaterThan(0);
    expect(screen.getByText(/Price: \$\$/)).toBeInTheDocument();
  });

  it('shows featured + verified badges', () => {
    render(<VenueCard venue={venue} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('Featured')).toBeInTheDocument();
    expect(screen.getByText('Verified')).toBeInTheDocument();
  });

  it('truncates tags to 3 with overflow badge', () => {
    render(<VenueCard venue={venue} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('+1 more')).toBeInTheDocument();
  });

  it('fires onEdit/onDelete', () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(<VenueCard venue={venue} onEdit={onEdit} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: /Edit/ }));
    fireEvent.click(screen.getByRole('button', { name: /Delete/ }));
    expect(onEdit).toHaveBeenCalledWith(venue);
    expect(onDelete).toHaveBeenCalledWith(venue);
  });
});
