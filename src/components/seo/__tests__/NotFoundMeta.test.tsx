/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useMeta', () => ({ useMeta: vi.fn() }));

import { NotFoundMeta } from '../NotFoundMeta';

describe('NotFoundMeta', () => {
  it('renders nothing', () => {
    const { container } = render(<NotFoundMeta />);
    expect(container).toBeTruthy();
  });
});
