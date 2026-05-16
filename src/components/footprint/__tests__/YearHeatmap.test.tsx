/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { YearHeatmap } from '../YearHeatmap';

describe('YearHeatmap', () => {
  it('renders empty', () => {
    const { container } = render(<YearHeatmap marks={[]} />);
    expect(container).toBeTruthy();
  });
});
