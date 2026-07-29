/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { RichTextField } from '../RichTextField';

/**
 * Regression guard for the wiring bug that wrote ProseMirror JSON objects into
 * plain `text` columns across ~13 content types (venues.description,
 * news_articles.content, personalities.bio, …).
 *
 * The editor's onChange signature is `(json, html)`. This field is bound to text
 * columns, so it must persist `html`. An edit that "simplifies" the handler back
 * to `(value) => onChange(value)` re-corrupts production data and is invisible
 * to tsc, so it has to be caught here.
 */

// Stands in for the lazy-loaded editor: fires onChange with the real
// two-argument shape, so the assertions are about the contract, not Tiptap.
vi.mock('@/components/cms/editor/RichTextEditor', () => ({
  RichTextEditor: ({
    value,
    onChange,
    editable,
  }: {
    value?: string | Record<string, unknown> | null;
    onChange?: (json: Record<string, unknown>, html: string) => void;
    editable?: boolean;
  }) => (
    <div>
      <div data-testid="seeded-value">{JSON.stringify(value)}</div>
      <div data-testid="editable">{String(editable)}</div>
      <button
        type="button"
        onClick={() =>
          onChange?.({ type: 'doc', content: [{ type: 'paragraph' }] }, '<p>edited</p>')
        }
      >
        emit
      </button>
    </div>
  ),
}));

const field = { name: 'body', label: 'Body', type: 'richtext' } as never;

function renderField(value: unknown, onChange = vi.fn(), disabled?: boolean) {
  render(<RichTextField field={field} value={value} onChange={onChange} disabled={disabled} />);
  return onChange;
}

describe('RichTextField', () => {
  it('renders fallback while editor loads', () => {
    const { container } = render(<RichTextField field={field} value="" onChange={vi.fn()} />);
    expect(container).toBeTruthy();
  });

  it('persists the HTML string, never the ProseMirror JSON object', async () => {
    const onChange = renderField('<p>initial</p>');

    fireEvent.click(await screen.findByRole('button', { name: 'emit' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const persisted = onChange.mock.calls[0][0];
    expect(typeof persisted).toBe('string');
    expect(persisted).toBe('<p>edited</p>');
    // The precise failure mode being guarded against.
    expect(persisted).not.toHaveProperty('type');
  });

  it('seeds the editor with the stored HTML unchanged', async () => {
    renderField('<p>stored</p>');
    await waitFor(() =>
      expect(screen.getByTestId('seeded-value')).toHaveTextContent('<p>stored</p>'),
    );
  });

  it('re-parses a row already corrupted with a stringified doc', async () => {
    // Such rows exist in production from the previous wiring. Feeding the raw
    // string to Tiptap would render literal JSON as body copy.
    const corrupted = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] });
    renderField(corrupted);

    await waitFor(() => {
      const seeded = JSON.parse(screen.getByTestId('seeded-value').textContent || 'null');
      expect(seeded).toMatchObject({ type: 'doc' });
    });
  });

  it('leaves genuine text that merely starts with a brace alone', async () => {
    renderField('{not json at all');
    await waitFor(() =>
      expect(screen.getByTestId('seeded-value')).toHaveTextContent('{not json at all'),
    );
  });

  it('maps disabled to the editor editable prop', async () => {
    renderField('<p>x</p>', vi.fn(), true);
    // Previously passed a `disabled` prop the editor does not declare, so the
    // editor stayed writable while a save was in flight.
    await waitFor(() => expect(screen.getByTestId('editable')).toHaveTextContent('false'));
  });
});
