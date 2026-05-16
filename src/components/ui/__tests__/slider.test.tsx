/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Slider } from '../slider';

describe('Slider', () => {
  it('renders', () => {
    const { container } = render(<Slider defaultValue={[50]} min={0} max={100} />);
    expect(container.querySelector('[role="slider"]')).toBeTruthy();
  });
});
