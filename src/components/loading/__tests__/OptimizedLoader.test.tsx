/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { OptimizedLoader } from '../OptimizedLoader';

describe('OptimizedLoader', () => {
  it('renders', () => {
    const { container } = render(<OptimizedLoader />);
    expect(container).toBeTruthy();
  });
});
