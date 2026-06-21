import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

// Mock BigHead since it's a heavy SVG library
vi.mock('@bigheads/core', () => ({
  BigHead: (_props: unknown) => <div data-testid="bighead-avatar">BigHead</div>,
}));

// Radix AvatarImage only mounts the <img> after the image successfully loads,
// which never happens in jsdom (no real network/image load) — so it would always
// show the fallback and the src assertions could never run. Mock the primitive to
// plain elements so the test exercises AvatarDisplay's own logic (which src/alt it
// passes for each prop) rather than radix's load-state behavior.
vi.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AvatarImage: ({ src, alt }: { src?: string; alt?: string }) => <img src={src} alt={alt} />,
  AvatarFallback: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import { AvatarDisplay } from '../AvatarDisplay';

describe('AvatarDisplay', () => {
  it('should render fallback icon when no props', () => {
    render(<AvatarDisplay />);
    // Should render the User icon fallback
    expect(document.querySelector('svg')).not.toBeNull();
  });

  it('should render avatar image when avatarUrl provided', async () => {
    render(<AvatarDisplay avatarUrl="https://example.com/avatar.jpg" />);
    const img = await screen.findByAltText('User avatar');
    expect(img.getAttribute('src')).toBe('https://example.com/avatar.jpg');
  });

  it('should render BigHead when avatarConfig provided', () => {
    const config = { body: 'chest', eyes: 'normal', hair: 'short' } as unknown;
    render(<AvatarDisplay avatarConfig={config} />);
    expect(screen.getByTestId('bighead-avatar')).toBeInTheDocument();
  });

  it('should render initials avatar when email provided', async () => {
    render(<AvatarDisplay email="test@example.com" />);
    const img = await screen.findByAltText('User avatar');
    expect(img.getAttribute('src')).toContain('data:image/svg+xml');
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
