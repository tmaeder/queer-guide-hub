/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { PlatformSelector } from '../PlatformSelector';

describe('PlatformSelector', () => {
  it('renders', () => {
    const { container } = render(<PlatformSelector onPlatformSelect={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
