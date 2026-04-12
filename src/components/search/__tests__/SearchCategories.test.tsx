import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Command } from '@/components/ui/command';
import { SearchCategories, searchCategories } from '../SearchCategories';

const renderWithCommand = (ui: React.ReactElement) =>
  render(<Command>{ui}</Command>);

describe('SearchCategories', () => {
  const defaultProps = {
    selectedCategory: 'all',
    query: 'test',
    onSelectCategory: vi.fn(),
  };

  it('should render all categories', () => {
    renderWithCommand(<SearchCategories {...defaultProps} />);
    for (const cat of searchCategories) {
      expect(screen.getByText(cat.label)).toBeInTheDocument();
    }
  });

  it('should show Selected badge for active category', () => {
    renderWithCommand(<SearchCategories {...defaultProps} selectedCategory="venues" />);
    expect(screen.getByText('Selected')).toBeInTheDocument();
  });

  it('should render Search in heading', () => {
    renderWithCommand(<SearchCategories {...defaultProps} />);
    expect(screen.getByText('Search in')).toBeInTheDocument();
  });
});
