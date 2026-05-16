/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useCMSContentMetadata', () => ({
  fetchCMSContentMetadata: vi.fn().mockResolvedValue([]),
  upsertCMSContentMetadata: vi.fn().mockResolvedValue({}),
  insertContentActions: vi.fn().mockResolvedValue({}),
  fetchCMSReviewQueueMetadata: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/hooks/useCMSWorkflow', () => ({ useCMSWorkflow: () => ({ workflows: [], transition: vi.fn() }) }));

import { ReviewQueue } from '../ReviewQueue';

describe('cms/ReviewQueue', () => {
  it('renders', () => {
    const { container } = render(<ReviewQueue onEdit={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
