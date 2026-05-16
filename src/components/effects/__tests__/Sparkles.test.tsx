/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Sparkles } from '../Sparkles';

describe('Sparkles', () => {
  it('renders', () => {
    const { container } = render(<Sparkles>x</Sparkles>);
    expect(container).toBeTruthy();
  });
});
