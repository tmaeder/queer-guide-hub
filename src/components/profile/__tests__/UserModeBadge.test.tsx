import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UserModeBadge } from '../UserModeBadge';

describe('UserModeBadge', () => {
  it('should render dating mode', () => {
    render(<UserModeBadge mode="dating" />);
    expect(screen.getByText('Looking for Love')).toBeInTheDocument();
  });

  it('should render friends mode', () => {
    render(<UserModeBadge mode="friends" />);
    expect(screen.getByText('Making Friends')).toBeInTheDocument();
  });

  it('should render exploration mode', () => {
    render(<UserModeBadge mode="exploration" />);
    expect(screen.getByText('Exploring')).toBeInTheDocument();
  });

  it('should render community mode', () => {
    render(<UserModeBadge mode="community" />);
    expect(screen.getByText('Building Community')).toBeInTheDocument();
  });

  it('should return null for unknown mode', () => {
    const { container } = render(<UserModeBadge mode="unknown" />);
    expect(container.innerHTML).toBe('');
  });

  it('should render all known modes without crashing', () => {
    const modes = ['dating', 'friends', 'exploration', 'fun', 'networking', 'community'];
    for (const mode of modes) {
      const { unmount } = render(<UserModeBadge mode={mode} />);
      unmount();
    }
  });
});
