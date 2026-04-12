import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import EqualityScoreBadge from '../EqualityScoreBadge';
describe('EqualityScoreBadge', () => {
  it('should render score value', () => { render(<EqualityScoreBadge score={85} />); expect(screen.getByText('85')).toBeInTheDocument(); });
  it('should render label for high score', () => { render(<EqualityScoreBadge score={85} />); expect(screen.getByText('Very High')).toBeInTheDocument(); });
  it('should render No Data for null', () => { render(<EqualityScoreBadge score={null} />); expect(screen.getByText('No Data')).toBeInTheDocument(); });
  it('should render for all sizes', () => { for (const size of ['sm', 'md', 'lg'] as const) { const { unmount } = render(<EqualityScoreBadge score={50} size={size} />); unmount(); } });
});
