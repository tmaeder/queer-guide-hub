import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import EmailBlockEditor from '../EmailBlockEditor';
import { readBlockDocument } from '../emailDocument';

// Geometry used by the real ProseMirror editor when focusing a selection.
Range.prototype.getBoundingClientRect = () => new DOMRect();
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;

describe('React Email block integration', () => {
  it('exports protected variables and inserts/reorders blocks inside the email container', async () => {
    const onChange = vi.fn();
    const { container } = render(
      <EmailBlockEditor
        initialHtml="<h1>Hello {{name}}</h1><p>Second block</p>"
        variables={[{ name: 'name' }]}
        onChange={onChange}
        onPending={vi.fn()}
        onError={vi.fn()}
      />,
    );
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange.mock.calls.at(-1)![1]).toContain('{{name}}');
    expect(onChange.mock.calls.at(-1)![1]).not.toContain('{{NAME}}');
    expect(
      screen
        .getByRole('textbox', { name: 'Email block content' })
        .querySelector('[data-email-variable]'),
    ).toHaveAttribute('contenteditable', 'false');
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Add block' }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Button' }));
    await waitFor(() =>
      expect(
        readBlockDocument(onChange.mock.calls.at(-1)![0])
          ?.content?.find((node) => node.type === 'container')
          ?.content?.some((node) => node.type === 'button'),
      ).toBe(true),
    );
    const document = readBlockDocument(onChange.mock.calls.at(-1)![0]);
    expect(
      document?.content
        ?.find((node) => node.type === 'container')
        ?.content?.some((node) => node.type === 'button'),
    ).toBe(true);
    fireEvent.click(container.querySelector('summary')!);
    fireEvent.click(screen.getByRole('button', { name: 'Move block 1 down' }));
    await waitFor(() =>
      expect(
        screen.getByRole('textbox', { name: 'Email block content' }).querySelector('h1, p')
          ?.tagName,
      ).toBe('P'),
    );
    expect(onChange.mock.calls.at(-1)![0]).toContain('{{name}}');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() =>
      expect(
        screen.getByRole('textbox', { name: 'Email block content' }).querySelector('h1, p')
          ?.tagName,
      ).toBe('H1'),
    );
    expect(screen.getByRole('textbox', { name: 'Email block content' })).toHaveTextContent(
      'Call to action',
    );
  }, 30000);
  it('disables all native mutation controls during a save', async () => {
    render(
      <EmailBlockEditor
        initialHtml="<p>Email</p>"
        variables={[{ name: 'name' }]}
        disabled
        onChange={vi.fn()}
        onPending={vi.fn()}
        onError={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Add block' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Insert variable' })).toBeDisabled();
    const canvas = await screen.findByRole('textbox', { name: 'Email block content' });
    expect(canvas).toHaveAttribute('contenteditable', 'false');
  });
});
