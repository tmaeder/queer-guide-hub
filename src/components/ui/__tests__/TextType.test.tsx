/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import TextType from '../TextType';

describe('TextType', () => {
  it('renders', () => {
    const { container } = render(<TextType text="Hello" />);
    expect(container).toBeTruthy();
  });
});
