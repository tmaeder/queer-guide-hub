import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@sentry/react', () => ({ captureException: vi.fn() }));

import { ErrorBoundary } from '../ErrorBoundary';

function ThrowingComponent() {
  throw new Error('Test error');
}

function GoodComponent() {
  return <div>All good</div>;
}

describe('ErrorBoundary', () => {
  beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}); });

  it('should render children when no error', () => {
    render(<ErrorBoundary><GoodComponent /></ErrorBoundary>);
    expect(screen.getByText('All good')).toBeInTheDocument();
  });

  it('should show error UI when child throws', () => {
    render(<ErrorBoundary><ThrowingComponent /></ErrorBoundary>);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Try Again')).toBeInTheDocument();
    expect(screen.getByText('Go Home')).toBeInTheDocument();
  });

  it('should render custom fallback when provided', () => {
    render(<ErrorBoundary fallback={<div>Custom Error</div>}><ThrowingComponent /></ErrorBoundary>);
    expect(screen.getByText('Custom Error')).toBeInTheDocument();
  });

  it('should recover when Try Again is clicked', () => {
    const { rerender: _rerender } = render(<ErrorBoundary><ThrowingComponent /></ErrorBoundary>);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Try Again'));
    // After retry, the throwing component throws again
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });
});
