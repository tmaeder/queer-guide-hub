/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@tiptap/react', () => ({
  useEditor: () => null,
  EditorContent: () => null,
}));

import { RichTextEditor } from '../RichTextEditor';

describe('RichTextEditor', () => {
  it('renders', () => {
    const { container } = render(<RichTextEditor value="" onChange={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
