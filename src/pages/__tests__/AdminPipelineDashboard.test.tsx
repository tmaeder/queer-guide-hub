/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('@/components/admin/pipeline-builder/PipelineDashboard', () => ({
  default: () => <div data-testid="dash" />,
}));

import AdminPipelineDashboard from '../AdminPipelineDashboard';

describe('AdminPipelineDashboard', () => {
  it('renders PipelineDashboard inside Suspense', async () => {
    render(<AdminPipelineDashboard />);
    await waitFor(() => expect(screen.getByTestId('dash')).toBeInTheDocument());
  });
});
