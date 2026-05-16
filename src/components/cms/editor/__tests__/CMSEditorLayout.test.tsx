/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/useCMSWorkflow', () => ({ useCMSWorkflow: () => ({ metadata: null, loading: false, transition: vi.fn(), setReviewLevel: vi.fn() }) }));
vi.mock('@/hooks/useCMSMedia', () => ({ useCMSMedia: () => ({ getAttachments: vi.fn().mockResolvedValue([]), attachMedia: vi.fn(), detachMedia: vi.fn() }) }));
vi.mock('@/hooks/useCMSRevisions', () => ({ useCMSRevisions: () => ({ revisions: [], loading: false, loadRevisions: vi.fn() }) }));
vi.mock('@/components/cms/media/MediaPickerDialog', () => ({ default: () => null }));
vi.mock('../EditorSidebar', () => ({ EditorSidebar: () => null }));
vi.mock('@/hooks/useCMSEditor', () => ({
  useCMSEditor: () => ({
    state: { data: {}, dirty: false, itemId: null, errors: {}, saving: false, loading: false },
    contentType: null, loading: false,
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
