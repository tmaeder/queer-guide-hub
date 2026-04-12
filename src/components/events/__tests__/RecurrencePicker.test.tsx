import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RecurrencePicker, describeRecurrence } from '../RecurrencePicker';

describe('describeRecurrence', () => {
  it('should return null for null rule', () => {
    expect(describeRecurrence(null)).toBeNull();
  });

  it('should return null for undefined rule', () => {
    expect(describeRecurrence(undefined)).toBeNull();
  });

  it('should describe daily', () => {
    const result = describeRecurrence({ freq: 'daily', interval: 1 });
    expect(result).toContain('Daily');
  });

  it('should describe weekly', () => {
    const result = describeRecurrence({ freq: 'weekly', interval: 1 });
    expect(result).toContain('Weekly');
  });

  it('should describe biweekly', () => {
    const result = describeRecurrence({ freq: 'biweekly', interval: 1 });
    expect(result).toContain('Every 2 weeks');
  });

  it('should include day names', () => {
    const result = describeRecurrence({ freq: 'weekly', interval: 1, byDay: [1, 3] });
    expect(result).toContain('Mon');
    expect(result).toContain('Wed');
  });

  it('should include until date', () => {
    const result = describeRecurrence({ freq: 'weekly', interval: 1, until: '2024-12-31T00:00:00Z' });
    expect(result).toContain('until');
  });
});

describe('RecurrencePicker', () => {
  it('should render toggle switch', () => {
    render(<RecurrencePicker value={null} onChange={vi.fn()} />);
    expect(screen.getByText('Recurring event')).toBeInTheDocument();
  });

  it('should show options when enabled', () => {
    render(
      <RecurrencePicker value={{ freq: 'weekly', interval: 1, byDay: [] }} onChange={vi.fn()} />,
    );
    expect(screen.getAllByText('Repeats').length).toBeGreaterThanOrEqual(1);
  });

  it('should show day buttons for weekly freq', () => {
    render(
      <RecurrencePicker value={{ freq: 'weekly', interval: 1, byDay: [] }} onChange={vi.fn()} />,
    );
    expect(screen.getByText('Mon')).toBeInTheDocument();
    expect(screen.getByText('Fri')).toBeInTheDocument();
  });

  it('should call onChange with null when toggled off', () => {
    const onChange = vi.fn();
    render(
      <RecurrencePicker value={{ freq: 'weekly', interval: 1 }} onChange={onChange} />,
    );
    const toggle = screen.getByRole('switch');
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('should call onChange with default rule when toggled on', () => {
    const onChange = vi.fn();
    render(<RecurrencePicker value={null} onChange={onChange} />);
    const toggle = screen.getByRole('switch');
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith({ freq: 'weekly', interval: 1, byDay: [] });
  });
});
