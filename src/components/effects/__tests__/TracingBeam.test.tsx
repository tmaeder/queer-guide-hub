/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TracingBeam } from '../TracingBeam';

describe('TracingBeam', () => {
  it('renders', () => {
    const { container } = render(<TracingBeam>x</TracingBeam>);
    expect(container).toBeTruthy();
  });
});
