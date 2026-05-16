/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TextHoverEffect } from '../TextHoverEffect';

describe('TextHoverEffect', () => {
  it('renders', () => {
    const { container } = render(<TextHoverEffect text="X" />);
    expect(container).toBeTruthy();
  });
});
