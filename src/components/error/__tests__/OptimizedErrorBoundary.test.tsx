/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import OptimizedErrorBoundary, { DataErrorFallback } from '../OptimizedErrorBoundary';

describe('OptimizedErrorBoundary', () => {
  it('renders children when no error', () => {
    render(<OptimizedErrorBoundary><span>safe</span></OptimizedErrorBoundary>);
    expect(screen.getByText('safe')).toBeInTheDocument();
  });
  it('DataErrorFallback renders', () => {
    const { container } = render(<DataErrorFallback error={new Error('Boom')} resetErrorBoundary={() => {}} />);
    expect(container).toBeTruthy();
  });
});
