/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AdminFilterBar } from '../AdminFilterBar';

describe('AdminFilterBar', () => {
  it('renders the search input when onSearchChange provided', () => {
    render(<AdminFilterBar search="hi" onSearchChange={vi.fn()} searchPlaceholder="Find…" />);
    expect(screen.getByPlaceholderText('Find…')).toHaveValue('hi');
  });

  it('hides the search input when onSearchChange omitted', () => {
    render(<AdminFilterBar />);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('fires onSearchChange on input', () => {
    const onChange = vi.fn();
    render(<AdminFilterBar onSearchChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText('Search…'), { target: { value: 'x' } });
    expect(onChange).toHaveBeenCalledWith('x');
  });

  it('renders one Select per filter def with the label as aria-label', () => {
    render(
      <AdminFilterBar
        filters={[
          { kind: 'select', key: 'f1', label: 'Status', value: 'all', onChange: vi.fn(), options: [{ label: 'All', value: 'all' }] },
          { kind: 'select', key: 'f2', label: 'Type', value: 'a', onChange: vi.fn(), options: [{ label: 'A', value: 'a' }] },
        ]}
      />,
    );
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
    expect(screen.getByLabelText('Type')).toBeInTheDocument();
  });

  it('renders trailing + bulk slots', () => {
    render(
      <AdminFilterBar
        trailing={<span data-testid="trailing">T</span>}
        bulk={<span data-testid="bulk">B</span>}
      />,
    );
    expect(screen.getByTestId('trailing')).toBeInTheDocument();
    expect(screen.getByTestId('bulk')).toBeInTheDocument();
  });
});
