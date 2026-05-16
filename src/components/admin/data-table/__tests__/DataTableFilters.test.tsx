/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/hooks/usePageFetchers', () => ({
  listWhereNotNull: vi.fn().mockResolvedValue([]),
}));

import { DataTableFilters } from '../DataTableFilters';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('DataTableFilters', () => {
  it('renders boolean filter', () => {
    render(
      <DataTableFilters
        filters={[{ key: 'featured', column: 'is_featured', label: 'Featured', type: 'boolean' } as never]}
        values={{}} onChange={vi.fn()}
      />,
      { wrapper },
    );
    expect(screen.getByText('Featured')).toBeInTheDocument();
  });

  it('boolean toggle fires onChange', () => {
    const onChange = vi.fn();
    render(
      <DataTableFilters
        filters={[{ key: 'featured', column: 'is_featured', label: 'Featured', type: 'boolean' } as never]}
        values={{}} onChange={onChange}
      />,
      { wrapper },
    );
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith('is_featured', true);
  });
});
