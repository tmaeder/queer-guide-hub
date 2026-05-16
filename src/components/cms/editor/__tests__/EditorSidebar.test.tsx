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

import { EditorSidebar } from '../EditorSidebar';

describe('EditorSidebar', () => {
  it('renders', () => {
    const { container } = render(
      <EditorSidebar contentType="venues" itemId="v1" metadata={null as never} onUpdateMetadata={vi.fn()} />,
    );
    expect(container).toBeTruthy();
  });
});
