/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/usePageFetchers', () => ({ insertRow: vi.fn().mockResolvedValue({ id: '1' }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import { UniversalContentCreator } from '../UniversalContentCreator';

describe('UniversalContentCreator', () => {
  it('renders', () => {
    const { container } = render(<UniversalContentCreator onContentCreated={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
