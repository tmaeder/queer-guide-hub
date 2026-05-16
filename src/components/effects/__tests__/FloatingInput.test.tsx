/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { FloatingInput } from '../FloatingInput';

describe('FloatingInput', () => {
  it('renders', () => {
    const { container } = render(<FloatingInput label="Name" />);
    expect(container.querySelector('input')).toBeTruthy();
  });
});
