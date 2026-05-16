/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toasts: [] }) }));

import { Toaster } from '../toaster';

describe('Toaster', () => {
  it('renders', () => {
    const { container } = render(<Toaster />);
    expect(container).toBeTruthy();
  });
});
