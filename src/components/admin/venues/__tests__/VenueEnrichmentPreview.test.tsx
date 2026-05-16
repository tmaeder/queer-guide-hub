/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VenueEnrichmentPreview } from '../VenueEnrichmentPreview';

const results = [
  { source: 'foursquare', status: 'ok', data: { name: 'Bar A', address: '1 Main', phone: '123', rating: 8 } },
  { source: 'google', status: 'ok', data: { name: 'Bar B', address: '2 Main', website: 'https://b' } },
] as never;

describe('VenueEnrichmentPreview', () => {
  it('renders nothing when closed', () => {
    render(<VenueEnrichmentPreview isOpen={false} onClose={vi.fn()} results={results} onSelectResult={vi.fn()} venueName="My Bar" />);
    expect(screen.queryByText(/Choose Venue Data Source/)).toBeNull();
  });

  it('renders each result card with source badge', () => {
    render(<VenueEnrichmentPreview isOpen onClose={vi.fn()} results={results} onSelectResult={vi.fn()} venueName="My Bar" />);
    expect(screen.getByText('Bar A')).toBeInTheDocument();
    expect(screen.getByText('Bar B')).toBeInTheDocument();
    expect(screen.getByText('Foursquare')).toBeInTheDocument();
    expect(screen.getByText('Google Places')).toBeInTheDocument();
  });

  it('Use This Data calls onSelectResult', () => {
    const onSelect = vi.fn();
    render(<VenueEnrichmentPreview isOpen onClose={vi.fn()} results={results} onSelectResult={onSelect} venueName="My Bar" />);
    const useButtons = screen.getAllByRole('button', { name: /Use This Data/ });
    fireEvent.click(useButtons[0]);
    expect(onSelect).toHaveBeenCalledWith(results[0].data);
  });

  it('Cancel button calls onClose', () => {
    const onClose = vi.fn();
    render(<VenueEnrichmentPreview isOpen onClose={onClose} results={results} onSelectResult={vi.fn()} venueName="My Bar" />);
    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));
    expect(onClose).toHaveBeenCalled();
  });
});
