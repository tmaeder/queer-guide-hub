/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useCMSContentMetadata', () => ({
  upsertCMSContentMetadata: vi.fn().mockResolvedValue({}),
  insertContentActions: vi.fn().mockResolvedValue({}),
}));

import { BulkActionsBar } from '../BulkActionsBar';

describe('BulkActionsBar', () => {
  it('renders empty selections', () => {
    const { container } = render(<BulkActionsBar selections={[]} onClear={vi.fn()} onComplete={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
