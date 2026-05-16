/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import ImportExportMenu from '../ImportExportMenu';

describe('ImportExportMenu', () => {
  it('renders trigger button', () => {
    render(<ImportExportMenu nodes={[]} edges={[]} pipelineName="p1" onImport={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Import \/ export/ })).toBeInTheDocument();
  });

  it('has a hidden file input for upload', () => {
    const { container } = render(<ImportExportMenu nodes={[]} edges={[]} pipelineName="p1" onImport={vi.fn()} />);
    expect(container.querySelector('input[type="file"]')).toBeInTheDocument();
  });
});
