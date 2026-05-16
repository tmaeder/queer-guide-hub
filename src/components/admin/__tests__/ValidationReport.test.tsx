/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useImportHub', () => ({
  useImportHub: () => ({ jobs: [], getValidationResults: vi.fn().mockResolvedValue([]) }),
}));

import { ValidationReport } from '../ValidationReport';

describe('ValidationReport', () => {
  it('renders without crashing when job not found', () => {
    const { container } = render(<ValidationReport jobId="missing" onClose={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
