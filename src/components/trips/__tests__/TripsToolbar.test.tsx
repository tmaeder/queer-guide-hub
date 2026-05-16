/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

import { TripsToolbar } from '../TripsToolbar';

const baseCounts = {
  all: 10, planning: 4, active: 1, completed: 3, archived: 2, saved: 0,
} as never;

const baseProps = {
  search: '',
  onSearchChange: vi.fn(),
  statusFilter: 'all' as const,
  onStatusFilterChange: vi.fn(),
  sortKey: 'recent' as const,
  onSortChange: vi.fn(),
  counts: baseCounts,
};

describe('TripsToolbar', () => {
  it('renders search input + status chips', () => {
    render(<TripsToolbar {...baseProps} />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'all' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'planning' })).toBeInTheDocument();
  });

  it('fires onSearchChange on input', () => {
    const onSearch = vi.fn();
    render(<TripsToolbar {...baseProps} onSearchChange={onSearch} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'pride' } });
    expect(onSearch).toHaveBeenCalledWith('pride');
  });

  it('marks active status chip aria-pressed=true', () => {
    render(<TripsToolbar {...baseProps} statusFilter="active" />);
    expect(screen.getByRole('button', { name: 'active' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'all' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('fires onStatusFilterChange when chip clicked', () => {
    const onStatus = vi.fn();
    render(<TripsToolbar {...baseProps} onStatusFilterChange={onStatus} />);
    fireEvent.click(screen.getByRole('button', { name: 'completed' }));
    expect(onStatus).toHaveBeenCalledWith('completed');
  });

  it('displays counts next to chips', () => {
    render(<TripsToolbar {...baseProps} />);
    expect(screen.getByRole('button', { name: 'planning' }).textContent).toContain('4');
    expect(screen.getByRole('button', { name: 'completed' }).textContent).toContain('3');
  });
});
