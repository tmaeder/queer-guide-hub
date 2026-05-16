/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SpotlightV2 } from '../SpotlightV2';

describe('SpotlightV2', () => {
  it('renders', () => {
    const { container } = render(<SpotlightV2  />);
    expect(container).toBeTruthy();
  });
});
