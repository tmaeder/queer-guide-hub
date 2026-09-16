import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StickyLetterBar } from '../StickyLetterBar';

describe('StickyLetterBar', () => {
  it('should render All button and A-Z letters', () => {
    render(<StickyLetterBar letter={null} onChange={vi.fn()} />);
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('Z')).toBeInTheDocument();
    expect(screen.getByText('#')).toBeInTheDocument();
  });

  it('should call onChange when letter clicked', () => {
    const onChange = vi.fn();
    render(<StickyLetterBar letter={null} onChange={onChange} />);
    fireEvent.click(screen.getByText('B'));
    expect(onChange).toHaveBeenCalledWith('B');
  });

  it('should call onChange with null when All clicked', () => {
    const onChange = vi.fn();
    render(<StickyLetterBar letter="A" onChange={onChange} />);
    fireEvent.click(screen.getByText('All'));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('should mark active letter as pressed', () => {
    render(<StickyLetterBar letter="M" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Filter by M')).toHaveAttribute('aria-pressed', 'true');
  });

  it('should have navigation role', () => {
    render(<StickyLetterBar letter={null} onChange={vi.fn()} />);
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });
});
