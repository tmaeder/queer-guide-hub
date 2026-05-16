/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useCMSEditor', () => ({
  useCMSEditor: () => ({
    state: { data: {}, dirty: false, itemId: null }, contentType: null, loading: false,
    onChange: vi.fn(), onSave: vi.fn(), onReset: vi.fn(),
    metadata: null, onUpdateMetadata: vi.fn(),
  }),
}));

import { CMSEditorLayout } from '../CMSEditorLayout';

describe('CMSEditorLayout', () => {
  it('renders', () => {
    const { container } = render(
      <CMSEditorLayout contentType="venues" itemId={null} onClose={vi.fn()} onSaved={vi.fn()} />,
    );
    expect(container).toBeTruthy();
  });
});
