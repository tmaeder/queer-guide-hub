/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('@/components/admin/pipeline-builder/UnifiedDataOps', () => ({
  default: () => <div data-testid="unified" />,
}));

import AdminPipelines from '../AdminPipelines';

describe('AdminPipelines', () => {
  it('renders Suspense fallback then UnifiedDataOps', async () => {
    render(<AdminPipelines />);
    await waitFor(() => expect(screen.getByTestId('unified')).toBeInTheDocument());
  });
});
