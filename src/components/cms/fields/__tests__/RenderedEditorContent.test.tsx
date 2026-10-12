/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FieldRenderer } from '../FieldRenderer';
import { JsonField } from '../JsonField';
import { StructuredValueView } from '../structured/StructuredValueView';
import { RichTextField } from '../RichTextField';
import { formatScalar, normalizeStructured } from '../structured/structuredValue';
import { StructuredEditor } from '@/components/admin/inline/editors/StructuredEditor';
import { getEditorForFieldType } from '@/components/admin/inline/editors';
import { StructuredValue } from '@/components/admin/triage/StructuredDataView';

vi.mock('@/components/cms/editor/RichTextEditor', () => ({
  RichTextEditor: ({
    value,
    onChange,
  }: {
    value: unknown;
    onChange?: (json: object, html: string) => void;
  }) => (
    <div data-testid="formatted-editor">
      <span>{typeof value === 'object' ? 'Document rendered' : 'HTML rendered'}</span>
      <button onClick={() => onChange?.({ type: 'doc', content: [] }, '<p>Updated</p>')}>
        Edit content
      </button>
    </div>
  ),
}));

const field = {
  group: 'basic' as const,
  name: 'unions',
  label: 'Same-Sex Unions',
  type: 'text' as const,
};
const json = JSON.stringify({ summary: 'No', marriage: 'No', marriage_since: null });

describe('rendered editor content', () => {
  it('summarizes hostile HTML as text without retaining executable content', () => {
    expect(
      formatScalar(
        '<p>Readable <img src=x onerror="alert(1)">summary</p><script>alert(2)</script>' +
          '<style>body{display:none}</style><iframe src="https://example.com"></iframe>' +
          '<object data="https://example.com"></object>',
      ),
    ).toBe('Readable summary');
  });
  it('keeps encoded markup as literal summary text when rendered', () => {
    const summary = formatScalar('<p>&lt;img src=x onerror=alert(1)&gt; &amp; 2 &lt; 3</p>');
    const { container } = render(<span>{summary}</span>);
    expect(container.textContent).toBe('<img src=x onerror=alert(1)> & 2 < 3');
    expect(container.querySelector('img')).toBeNull();
  });
  it('uses structured controls for JSON stored in a text column and saves text', () => {
    const change = vi.fn();
    const { container } = render(<FieldRenderer field={field} value={json} onChange={change} />);
    expect(container.querySelector('input')?.value).not.toContain('{');
    expect(screen.getByLabelText('Same-Sex Unions › Summary')).toHaveValue('No');
    fireEvent.change(screen.getByLabelText('Same-Sex Unions › Summary'), {
      target: { value: 'Yes' },
    });
    expect(change).toHaveBeenLastCalledWith(
      JSON.stringify({ summary: 'Yes', marriage: 'No', marriage_since: null }),
    );
  });
  it('renders nested HTML as safe formatting, including lists and encoded nested JSON', () => {
    const { container } = render(
      <StructuredValueView
        value={{
          enforcement:
            '<h2>Enforcement Overview</h2><p>Reported incidents<script>alert(1)</script><a href="javascript:alert(1)">Source</a></p>',
          detail: JSON.stringify({ note: '<p>Readable note</p>' }),
          items: ['<strong>Listed content</strong>'],
        }}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Enforcement Overview' })).toBeInTheDocument();
    expect(screen.getByText('Readable note')).toBeInTheDocument();
    expect(container.querySelector('strong')).toHaveTextContent('Listed content');
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('[href^="javascript:"]')).toBeNull();
    expect(container.textContent).not.toMatch(/<h2|<p>|"note":/);
  });
  it('never puts nested HTML or encoded groups into a text input', async () => {
    const { container } = render(
      <JsonField
        field={{ ...field, type: 'json' }}
        value={{
          enforcement: '<h2>Overview</h2><p>Detail</p>',
          nested: JSON.stringify({ legal: false }),
        }}
        onChange={vi.fn()}
      />,
    );
    await screen.findByTestId('formatted-editor');
    for (const input of container.querySelectorAll('input,textarea'))
      expect((input as HTMLInputElement).value).not.toMatch(/<h2|<p>|"legal":/);
    expect(
      screen.getByRole('switch', { name: 'Same-Sex Unions › Nested › Legal' }),
    ).toBeInTheDocument();
  });
  it('shows formatted HTML during rich-editor loading and renders document objects directly', async () => {
    const { container, rerender } = render(
      <RichTextField
        field={{ ...field, type: 'richtext' }}
        value="<h2>Heading</h2><p>Body</p>"
        onChange={vi.fn()}
      />,
    );
    expect(container.querySelector('textarea')).toBeNull();
    expect(container.textContent).not.toContain('<h2>');
    await screen.findByTestId('formatted-editor');
    rerender(
      <RichTextField
        field={{ ...field, type: 'richtext' }}
        value={{ type: 'doc', content: [] }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText('Document rendered')).toBeInTheDocument();
  });
  it('hides malformed serialized content without exposing an editable source input', () => {
    const { container } = render(
      <FieldRenderer field={field} value={'{"summary":'} onChange={vi.fn()} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('could not be displayed');
    expect(container.querySelector('input,textarea')).toBeNull();
    expect(container.textContent).not.toContain('{"summary":');
  });
  it('keeps plain prose and comparisons in ordinary text controls', () => {
    render(<FieldRenderer field={field} value="2 < 3 and [optional]" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Same-Sex Unions')).toHaveValue('2 < 3 and [optional]');
  });
  it('decodes double encoded container values', () => {
    expect(normalizeStructured(JSON.stringify(json))).toEqual(JSON.parse(json));
  });
  it('preserves encoded text in an inline structured editor even when saved unchanged', () => {
    const save = vi.fn();
    render(
      <StructuredEditor
        field={field}
        initialValue={json}
        onSave={save}
        onCancel={vi.fn()}
        saving={false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));
    expect(save).toHaveBeenCalledWith(json);
  });
  it('adapts inline editor routing to the stored value', () => {
    expect(getEditorForFieldType('text', json)).toBe(getEditorForFieldType('json'));
    expect(getEditorForFieldType('textarea', '<p>Body</p>')).toBe(
      getEditorForFieldType('richtext'),
    );
  });
  it('renders review values instead of showing source markup', () => {
    const { container } = render(
      <StructuredValue
        value={JSON.stringify({ enforcement: '<h2>Review heading</h2><p>Reviewed content</p>' })}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Review heading' })).toBeInTheDocument();
    expect(container.textContent).not.toContain('<h2>');
  });
});
