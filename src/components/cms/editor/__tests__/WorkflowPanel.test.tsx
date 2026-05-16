/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useCMSWorkflow', () => ({
  useCMSWorkflow: () => ({
    metadata: null, loading: false,
    transition: vi.fn(), setReviewLevel: vi.fn(),
  }),
}));

import { WorkflowPanel } from '../WorkflowPanel';

describe('WorkflowPanel', () => {
  it('renders', () => {
    const { container } = render(<WorkflowPanel contentType="venues" itemId="v1" />);
    expect(container).toBeTruthy();
  });
});
