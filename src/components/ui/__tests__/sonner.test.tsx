/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Toaster, toast } from '../sonner';

describe('sonner Toaster', () => {
  it('renders', () => {
    const { container } = render(<Toaster />);
    expect(container).toBeTruthy();
  });
  it('exposes toast function', () => {
    expect(typeof toast).toBe('function');
  });
});
