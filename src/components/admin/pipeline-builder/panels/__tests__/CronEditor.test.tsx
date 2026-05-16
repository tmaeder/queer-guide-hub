/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CronEditor, { describeCron, validateCron } from '../CronEditor';

describe('describeCron', () => {
  it('returns Manual for empty input', () => {
    expect(describeCron(null)).toBe('Manual (no schedule)');
    expect(describeCron('')).toBe('Manual (no schedule)');
  });

  it('matches preset by label', () => {
    expect(describeCron('0 * * * *')).toBe('Hourly (top of hour)');
  });

  it('describes interval expressions', () => {
    expect(describeCron('*/5 * * * *')).toContain('5 minutes');
    expect(describeCron('30 14 * * *')).toContain('14:30');
  });

  it('falls back to Custom: prefix for unknown cron', () => {
    expect(describeCron('1 2 3 4 5')).toContain('Custom:');
  });
});

describe('validateCron', () => {
  it('rejects wrong field count', () => {
    expect(validateCron('* * *')).toMatchObject({ valid: false });
  });

  it('accepts standard cron', () => {
    expect(validateCron('0 * * * *')).toEqual({ valid: true });
  });

  it('rejects out-of-range fields', () => {
    expect(validateCron('60 * * * *').valid).toBe(false);
    expect(validateCron('* 24 * * *').valid).toBe(false);
  });

  it('accepts step expressions like */5', () => {
    expect(validateCron('*/5 * * * *')).toEqual({ valid: true });
  });
});

describe('CronEditor UI', () => {
  it('renders preset + raw toggle buttons', () => {
    render(<CronEditor value={null} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Preset' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Raw cron' })).toBeInTheDocument();
  });

  it('switching to raw shows input', () => {
    render(<CronEditor value={null} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Raw cron' }));
    expect(screen.getByPlaceholderText(/min hour dom month dow/)).toBeInTheDocument();
  });

  it('raw input fires onChange with valid expression', () => {
    const onChange = vi.fn();
    render(<CronEditor value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Raw cron' }));
    fireEvent.change(screen.getByPlaceholderText(/min hour dom/), { target: { value: '0 * * * *' } });
    expect(onChange).toHaveBeenCalledWith('0 * * * *');
  });
});
