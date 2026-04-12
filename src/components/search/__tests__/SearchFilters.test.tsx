import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Command } from '@/components/ui/command';
import { SearchFilters } from '../SearchFilters';

const renderWithCommand = (ui: React.ReactElement) =>
  render(<Command>{ui}</Command>);

describe('SearchFilters', () => {
  it('should render all quick filter options', () => {
    renderWithCommand(<SearchFilters onAddFilter={vi.fn()} />);
    expect(screen.getByText('Featured only')).toBeInTheDocument();
    expect(screen.getByText('Free events')).toBeInTheDocument();
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('Near me')).toBeInTheDocument();
    expect(screen.getByText('Popular')).toBeInTheDocument();
  });

  it('should render Quick filters heading', () => {
    renderWithCommand(<SearchFilters onAddFilter={vi.fn()} />);
    expect(screen.getByText('Quick filters')).toBeInTheDocument();
  });
});
