/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ApiErrorFilters, DEFAULT_ERROR_FILTERS } from '../ApiErrorFilters';

describe('ApiErrorFilters', () => {
  it('renders search input', () => {
    render(<ApiErrorFilters state={DEFAULT_ERROR_FILTERS} update={vi.fn()} />);
    expect(screen.getByPlaceholderText(/Search message/)).toBeInTheDocument();
  });

  it('typing fires update', () => {
    const update = vi.fn();
    render(<ApiErrorFilters state={DEFAULT_ERROR_FILTERS} update={update} />);
    fireEvent.change(screen.getByPlaceholderText(/Search message/), { target: { value: 'rls' } });
    expect(update).toHaveBeenCalledWith({ q: 'rls' });
  });

  it('clears query via X button', () => {
    const update = vi.fn();
    render(<ApiErrorFilters state={{ ...DEFAULT_ERROR_FILTERS, q: 'foo' }} update={update} />);
    fireEvent.click(screen.getByRole('button'));
    expect(update).toHaveBeenCalledWith({ q: '' });
  });
});
