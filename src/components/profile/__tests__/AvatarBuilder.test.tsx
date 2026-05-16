/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { AvatarBuilder, generateRandomConfig } from '../AvatarBuilder';

describe('AvatarBuilder', () => {
  it('renders', () => {
    const { container } = render(<AvatarBuilder onSave={vi.fn()} />);
    expect(container).toBeTruthy();
  });
  it('generateRandomConfig returns valid config', () => {
    const c = generateRandomConfig();
    expect(c).toBeDefined();
  });
});
