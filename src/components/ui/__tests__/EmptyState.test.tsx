import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Newspaper } from 'lucide-react';
import { EmptyState } from '../EmptyState';

describe('EmptyState', () => {
  it('renders title, description, and primary/secondary actions', () => {
    const primary = vi.fn();
    const secondary = vi.fn();
    render(
      <EmptyState
        icon={Newspaper}
        title="Nothing yet"
        description="Check back soon."
        primaryAction={{ label: 'Go home', onClick: primary }}
        secondaryAction={{ label: 'Help', onClick: secondary }}
      />,
    );
    expect(screen.getByText('Nothing yet')).toBeInTheDocument();
    expect(screen.getByText('Check back soon.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Go home' }));
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    expect(primary).toHaveBeenCalledTimes(1);
    expect(secondary).toHaveBeenCalledTimes(1);
  });

  it('variant="filtered" renders filter chips and invokes onRemove', () => {
    const removeA = vi.fn();
    const removeB = vi.fn();
    render(
      <EmptyState
        icon={Newspaper}
        variant="filtered"
        title="No match"
        description="Try fewer filters."
        activeFilters={[
          { label: 'Category: News', onRemove: removeA },
          { label: 'Search: pride', onRemove: removeB },
        ]}
      />,
    );
    expect(screen.getByTestId('empty-state-active-filters')).toBeInTheDocument();
    expect(screen.getByText('Category: News')).toBeInTheDocument();
    expect(screen.getByText('Search: pride')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Category: News' }));
    expect(removeA).toHaveBeenCalledTimes(1);
  });

  it('variant="filtered" with onResetFilters renders default reset action', () => {
    const reset = vi.fn();
    render(
      <EmptyState
        icon={Newspaper}
        variant="filtered"
        title="No match"
        description="."
        activeFilters={[{ label: 'x', onRemove: () => {} }]}
        onResetFilters={reset}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /reset filters/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('variant="empty" (default) does not render filter chip row', () => {
    render(
      <EmptyState
        icon={Newspaper}
        title="Empty"
        description="."
        activeFilters={[{ label: 'Ignored', onRemove: () => {} }]}
      />,
    );
    expect(screen.queryByTestId('empty-state-active-filters')).not.toBeInTheDocument();
    expect(screen.queryByText('Ignored')).not.toBeInTheDocument();
  });
});
