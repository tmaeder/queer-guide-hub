/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useCMSRevisions', () => ({
  useCMSRevisions: () => ({ revisions: [], loading: false, loadRevisions: vi.fn() }),
}));

import { RevisionPanel } from '../RevisionPanel';

describe('cms/editor/RevisionPanel', () => {
  it('renders', () => {
    const { container } = render(<RevisionPanel sourceTable="venues" sourceId="v1" />);
    expect(container).toBeTruthy();
  });
});
