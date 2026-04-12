import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SecurityAlert } from '../SecurityAlert';

describe('SecurityAlert', () => {
  it('should render title and description', () => {
    render(<SecurityAlert level="info" title="Test Alert" description="Some details" />);
    expect(screen.getByText('Test Alert')).toBeInTheDocument();
    expect(screen.getByText('Some details')).toBeInTheDocument();
  });

  it('should render for all levels without crashing', () => {
    const levels = ['info', 'warning', 'error', 'success'] as const;
    for (const level of levels) {
      const { unmount } = render(
        <SecurityAlert level={level} title={`${level} alert`} description="desc" />,
      );
      expect(screen.getByText(`${level} alert`)).toBeInTheDocument();
      unmount();
    }
  });
});
