/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ImportStatusBadge } from '../ImportStatusBadge';

describe('ImportStatusBadge', () => {
  it.each([
    ['completed', 'Completed'],
    ['failed', 'Failed'],
    ['processing', 'Processing'],
    ['validating', 'Validating'],
    ['cancelled', 'Cancelled'],
    ['pending', 'Pending'],
  ] as const)('renders %s label', (status, label) => {
    render(<ImportStatusBadge status={status as never} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('hides icon when showIcon=false', () => {
    const { container } = render(<ImportStatusBadge status={'completed' as never} showIcon={false} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('shows icon by default', () => {
    const { container } = render(<ImportStatusBadge status={'completed' as never} />);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('spins icon for processing status', () => {
    const { container } = render(<ImportStatusBadge status={'processing' as never} />);
    const svg = container.querySelector('svg') as SVGElement;
    expect(svg.getAttribute('style')).toMatch(/animation/);
  });
});
