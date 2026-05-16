/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Skeleton } from '../skeleton';

describe('Skeleton', () => {
  it('renders', () => {
    const { container } = render(<Skeleton className="h-4 w-20" />);
    expect(container.firstChild).toBeTruthy();
  });
});
