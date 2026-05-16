/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/usePageFetchers', () => ({ listFrom: vi.fn().mockResolvedValue([]) }));

import { CMSDuplicateManager } from '../CMSDuplicateManager';

describe('CMSDuplicateManager', () => {
  it('renders', () => {
    const { container } = render(<CMSDuplicateManager />);
    expect(container).toBeTruthy();
  });
});
