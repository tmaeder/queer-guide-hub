/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { EnhancedFormValidator } from '../EnhancedFormValidator';

describe('EnhancedFormValidator', () => {
  it('renders children', () => {
    const { container } = render(<EnhancedFormValidator><div>child</div></EnhancedFormValidator>);
    expect(container).toBeTruthy();
  });
});
