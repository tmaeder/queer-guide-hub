/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useCMSWorkflow', () => ({
  useCMSWorkflow: () => ({
    availableTransitions: [], transition: vi.fn(), isTransitioning: false, error: null,
  }),
}));
vi.mock('@/hooks/useCMSContentMetadata', () => ({
  fetchCMSContentMetadata: vi.fn().mockResolvedValue(null),
  upsertCMSContentMetadata: vi.fn().mockResolvedValue({}),
  insertContentActions: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import { WorkflowPanel } from '../WorkflowPanel';

describe('WorkflowPanel', () => {
  it('renders', () => {
    const { container } = render(<WorkflowPanel contentType="venues" itemId="v1" />);
    expect(container).toBeTruthy();
  });
});
