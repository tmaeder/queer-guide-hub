/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useImportHub', () => ({
  useImportHub: () => ({
    createImportJob: vi.fn().mockResolvedValue({}),
    parseCSVPreview: vi.fn().mockResolvedValue({ rows: [], columns: [] }),
    loading: false,
  }),
}));

import { ImportJobCreator } from '../ImportJobCreator';

describe('ImportJobCreator', () => {
  it('renders without crashing', () => {
    const { container } = render(<ImportJobCreator />);
    expect(container).toBeTruthy();
  });
});
