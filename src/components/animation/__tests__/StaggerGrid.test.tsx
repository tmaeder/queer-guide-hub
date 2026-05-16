/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { StaggerGrid } from '../StaggerGrid';

describe('StaggerGrid', () => {
  it('renders children', () => {
    const { container } = render(<StaggerGrid><div>a</div><div>b</div></StaggerGrid>);
    expect(container).toBeTruthy();
  });
});
