/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ColourfulText } from '../ColourfulText';

describe('ColourfulText', () => {
  it('renders text', () => {
    const { container } = render(<ColourfulText text="Hello" />);
    expect(container).toBeTruthy();
  });
});
