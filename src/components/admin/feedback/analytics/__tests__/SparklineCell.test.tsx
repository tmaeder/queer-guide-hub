/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SparklineCell } from '../SparklineCell';

describe('SparklineCell', () => {
  it('renders a blank placeholder when data is empty', () => {
    const { container } = render(<SparklineCell data={[]} />);
    // Empty branch returns a <span>, no <svg>.
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('span')).not.toBeNull();
  });

  it('renders an SVG with area path + polyline + last-point circle for a series', () => {
    const { container } = render(<SparklineCell data={[1, 3, 2, 5]} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(container.querySelector('path')).not.toBeNull();
    expect(container.querySelector('polyline')).not.toBeNull();
    expect(container.querySelector('circle')).not.toBeNull();
  });

  it('honors custom width/height/color props', () => {
    const { container } = render(
      <SparklineCell data={[1, 2]} width={100} height={30} color="hsl(var(--foreground))" />,
    );
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('100');
    expect(svg.getAttribute('height')).toBe('30');

    const poly = container.querySelector('polyline')!;
    expect(poly.getAttribute('stroke')).toBe('hsl(var(--foreground))');
  });

  it('handles a single-point series without dividing by zero', () => {
    const { container } = render(<SparklineCell data={[7]} />);
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
