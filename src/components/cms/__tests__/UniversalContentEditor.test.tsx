/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/usePageFetchers', () => ({ updateRow: vi.fn().mockResolvedValue({}) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import { UniversalContentEditor } from '../UniversalContentEditor';

describe('UniversalContentEditor', () => {
  it('renders', () => {
    const { container } = render(<UniversalContentEditor content={{ id: 'x1', title: 'T', content_type: 'venues' } as never} onClose={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
