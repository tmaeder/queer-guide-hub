/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { DatePickerWithRange } from '../date-range-picker';

describe('DatePickerWithRange', () => {
  it('renders', () => {
    const { container } = render(<DatePickerWithRange date={undefined} onDateChange={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
