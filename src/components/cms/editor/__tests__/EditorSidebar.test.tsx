/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useCMSRevisions', () => ({
  useCMSRevisions: () => ({ revisions: [], loading: false, loadRevisions: vi.fn() }),
}));
vi.mock('@/hooks/useCMSMedia', () => ({
  useCMSMedia: () => ({ assets: [], loading: false, loadAssets: vi.fn() }),
}));
vi.mock('@/config/contentTypeRegistry', () => ({ getContentType: () => null }));
vi.mock('@/hooks/useCMSWorkflow', () => ({ useCMSWorkflow: () => ({ availableTransitions: [], transition: vi.fn(), isTransitioning: false, error: null }) }));
vi.mock('@/hooks/useCMSContentMetadata', () => ({
  fetchCMSContentMetadata: vi.fn().mockResolvedValue(null),
  upsertCMSContentMetadata: vi.fn().mockResolvedValue({}),
  insertContentActions: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import { EditorSidebar } from '../EditorSidebar';

describe('EditorSidebar', () => {
  it('renders', () => {
    const { container } = render(
      <EditorSidebar contentType="venues" itemId="v1" metadata={null as never} onUpdateMetadata={vi.fn()} />,
    );
    expect(container).toBeTruthy();
  });
});
