/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useCMSRevisions', () => ({
  useCMSRevisions: () => ({ revisions: [], loading: false, error: null, loadRevisions: vi.fn(), restore: vi.fn() }),
}));

import { RevisionHistory } from '../RevisionHistory';

describe('RevisionHistory', () => {
  it('renders', () => {
    const { container } = render(<RevisionHistory sourceTable="venues" sourceId="v1" />);
    expect(container).toBeTruthy();
  });
});
