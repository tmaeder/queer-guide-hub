/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, type Mock } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { DocumentField } from '../DocumentField';

/**
 * The document field owns three columns at once. A save that wrote body_doc
 * without body_html would leave every public surface showing stale content
 * indefinitely, because the reader path never looks at body_doc.
 */

const DOC = { type: 'doc', content: [{ type: 'paragraph' }] };

vi.mock('@/components/cms/editor/RichTextEditor', () => ({
  RichTextEditor: ({
    value,
    onChange,
    editable,
    enableDatabaseBlock,
  }: {
    value?: unknown;
    onChange?: (json: Record<string, unknown>, html: string) => void;
    editable?: boolean;
    enableDatabaseBlock?: boolean;
  }) => (
    <div>
      <div data-testid="seed">{JSON.stringify(value)}</div>
      <div data-testid="editable">{String(editable)}</div>
      <div data-testid="blocks-enabled">{String(enableDatabaseBlock)}</div>
      <button type="button" onClick={() => onChange?.(DOC, '<p>edited</p>')}>
        emit
      </button>
    </div>
  ),
}));

const field = { name: 'body_doc', label: 'Body', type: 'document' } as never;

function renderField(
  over: {
    value?: unknown;
    allValues?: Record<string, unknown>;
    setFields?: Mock<(fields: Record<string, unknown>) => void>;
    onChange?: Mock<(value: unknown) => void>;
    disabled?: boolean;
  } = {},
) {
  const setFields = over.setFields ?? vi.fn<(fields: Record<string, unknown>) => void>();
  const onChange = over.onChange ?? vi.fn<(value: unknown) => void>();
  render(
    <DocumentField
      field={field}
      value={over.value ?? null}
      onChange={onChange}
      setFields={over.setFields === null ? undefined : setFields}
      allValues={over.allValues}
      disabled={over.disabled}
    />,
  );
  return { setFields, onChange };
}

describe('DocumentField', () => {
  it('writes body_doc, body_html and body_source in a single batch', async () => {
    const { setFields } = renderField();
    fireEvent.click(await screen.findByRole('button', { name: 'emit' }));

    expect(setFields).toHaveBeenCalledTimes(1);
    expect(setFields.mock.calls[0][0]).toEqual({
      body_doc: DOC,
      body_html: '<p>edited</p>',
      body_source: 'doc',
    });
  });

  it('enables the database block, unlike the plain richtext field', async () => {
    renderField();
    await waitFor(() =>
      expect(screen.getByTestId('blocks-enabled')).toHaveTextContent('true'),
    );
  });

  it('seeds from the stored doc when one exists', async () => {
    renderField({ value: DOC, allValues: { body_html: '<p>stale</p>' } });
    await waitFor(() => {
      expect(JSON.parse(screen.getByTestId('seed').textContent || 'null')).toMatchObject({
        type: 'doc',
      });
    });
  });

  it('falls back to existing HTML so a legacy page converts on first edit', async () => {
    // Conversion is an explicit editorial act with a visible diff, rather than
    // a blind migration over hand-authored legal copy.
    renderField({ value: null, allValues: { body_html: '<p>legacy legal copy</p>' } });
    await waitFor(() =>
      expect(screen.getByTestId('seed')).toHaveTextContent('legacy legal copy'),
    );
  });

  it('seeds empty when there is neither doc nor html', async () => {
    renderField();
    await waitFor(() => expect(screen.getByTestId('seed')).toHaveTextContent('""'));
  });

  it('maps disabled to editable', async () => {
    renderField({ disabled: true });
    await waitFor(() => expect(screen.getByTestId('editable')).toHaveTextContent('false'));
  });

  it('persists the doc rather than dropping the edit when no batch setter exists', async () => {
    const onChange = vi.fn();
    render(
      <DocumentField field={field} value={null} onChange={onChange} />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'emit' }));
    expect(onChange).toHaveBeenCalledWith(DOC);
  });
});
