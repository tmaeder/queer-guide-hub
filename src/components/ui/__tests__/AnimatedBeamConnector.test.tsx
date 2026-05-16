/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { AnimatedBeamConnector } from '../AnimatedBeamConnector';

describe('AnimatedBeamConnector', () => {
  it('renders vertical default', () => {
    const { container } = render(<AnimatedBeamConnector />);
    expect(container).toBeTruthy();
  });
  it('renders horizontal active', () => {
    const { container } = render(<AnimatedBeamConnector active orientation="horizontal" />);
    expect(container).toBeTruthy();
  });
});
