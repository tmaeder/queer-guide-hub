import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { TagChip } from '../TagChip';

const wrap = (ui: React.ReactNode) => <MemoryRouter>{ui}</MemoryRouter>;

describe('TagChip', () => {
  it('links to the canonical tag page using the slug', () => {
    render(wrap(<TagChip tag="bear-bar" name="Bear Bar" />));
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/resources/bear-bar');
    expect(link).toHaveTextContent('Bear Bar');
  });

  it('derives a display name from the slug when none is given', () => {
    render(wrap(<TagChip tag="leather-bar" />));
    expect(screen.getByRole('link')).toHaveTextContent('Leather Bar');
  });

  it('renders a removable button (not a link) and calls onRemove', () => {
    const onRemove = vi.fn();
    render(wrap(<TagChip tag="gay" removable onRemove={onRemove} />));
    expect(screen.queryByRole('link')).toBeNull();
    fireEvent.click(screen.getByRole('button'));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it('shows a count when greater than zero', () => {
    render(wrap(<TagChip tag="nightlife" count={42} />));
    expect(screen.getByRole('link')).toHaveTextContent('42');
  });
});
