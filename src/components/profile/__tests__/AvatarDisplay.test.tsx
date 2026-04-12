import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock BigHead since it's a heavy SVG library
vi.mock('@bigheads/core', () => ({
  BigHead: (_props: unknown) => <div data-testid="bighead-avatar">BigHead</div>,
}));

import { AvatarDisplay } from '../AvatarDisplay';

describe('AvatarDisplay', () => {
  it('should render fallback icon when no props', () => {
    render(<AvatarDisplay />);
    // Should render the User icon fallback
    expect(document.querySelector('svg')).not.toBeNull();
  });

  it('should render avatar image when avatarUrl provided', () => {
    render(<AvatarDisplay avatarUrl="https://example.com/avatar.jpg" />);
    const img = document.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('https://example.com/avatar.jpg');
  });

  it('should render BigHead when avatarConfig provided', () => {
    const config = { body: 'chest', eyes: 'normal', hair: 'short' } as unknown;
    render(<AvatarDisplay avatarConfig={config} />);
    expect(screen.getByTestId('bighead-avatar')).toBeInTheDocument();
  });

  it('should render initials avatar when email provided', () => {
    render(<AvatarDisplay email="test@example.com" />);
    const img = document.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toContain('data:image/svg+xml');
  });

  it('should prioritize avatarUrl over avatarConfig', () => {
    render(<AvatarDisplay avatarUrl="https://example.com/a.jpg" avatarConfig={{} as unknown} />);
    expect(screen.queryByTestId('bighead-avatar')).not.toBeInTheDocument();
  });

  it('should render without crashing for all sizes', () => {
    const sizes = ['sm', 'md', 'lg'] as const;
    for (const size of sizes) {
      const { unmount } = render(<AvatarDisplay email="a@b.com" size={size} />);
      unmount();
    }
  });
});
