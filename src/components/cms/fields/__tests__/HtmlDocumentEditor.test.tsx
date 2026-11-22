/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HtmlDocumentEditor } from '../HtmlDocumentEditor';

function loadFrame() {
  const frame = screen.getByTitle('Email content') as HTMLIFrameElement;
  const document = frame.contentDocument!;
  document.open();
  document.write(frame.srcdoc);
  document.close();
  fireEvent.load(frame);
  return { frame, document };
}

describe('HtmlDocumentEditor', () => {
  it('renders a sandboxed document and preserves layout and variables when editing', () => {
    const change = vi.fn();
    render(
      <HtmlDocumentEditor
        label="Email content"
        value={
          '<!DOCTYPE html><html><head><style>td{padding:12px}</style></head><body><table><tbody><tr><td><p>Hello {{name}}</p></td></tr></tbody></table><script>alert(1)</script></body></html>'
        }
        onChange={change}
      />,
    );
    const { frame, document } = loadFrame();
    expect(frame).toHaveAttribute('sandbox', 'allow-same-origin');
    expect(document.querySelector('script')).toBeNull();
    expect(document.querySelector('table')).not.toBeNull();
    document.querySelector('p')!.textContent = 'Welcome {{name}}';
    fireEvent.input(document.body);
    const saved = change.mock.calls.at(-1)![0] as string;
    expect(saved).toContain('<style>td{padding:12px}</style>');
    expect(saved).toContain('<table>');
    expect(saved).toContain('Welcome {{name}}');
    expect(saved).not.toMatch(/script|contenteditable|Content-Security-Policy/);
  });
  it('saves fragments as fragments and sanitizes pasted markup', () => {
    const change = vi.fn();
    render(<HtmlDocumentEditor label="Email content" value="<p>Hello</p>" onChange={change} />);
    const { document } = loadFrame();
    document.body.innerHTML =
      '<p>Updated</p><img src="x" onerror="alert(1)"><img data-qg-original-src="javascript:alert(1)"><script>alert(1)</script>';
    fireEvent.input(document.body);
    const saved = change.mock.calls.at(-1)![0] as string;
    expect(saved).toContain('<p>Updated</p>');
    expect(saved).not.toMatch(/<html|onerror|<script|javascript:/);
  });
  it('previews images from R2 but saves the original addresses', () => {
    const change = vi.fn();
    const logo = 'https://cdn.example.org/logo.png';
    render(
      <HtmlDocumentEditor
        label="Email content"
        value={`<p>Hi</p><img src="${logo}" alt="">`}
        onChange={change}
      />,
    );
    const { document } = loadFrame();
    expect(document.querySelector('img')!.getAttribute('src')).toMatch(
      /^https:\/\/img\.queer\.guide\/r\//,
    );
    document.querySelector('p')!.textContent = 'Hello';
    fireEvent.input(document.body);
    const saved = change.mock.calls.at(-1)![0] as string;
    expect(saved).toContain(`src="${logo}"`);
    expect(saved).not.toMatch(/img\.queer\.guide|data-qg-original-src/);
  });
  it('provides a rendered read-only preview', () => {
    render(<HtmlDocumentEditor label="Email content" value="<h2>Preview</h2>" editable={false} />);
    const { document } = loadFrame();
    expect(document.body.contentEditable).toBe('false');
    expect(document.querySelector('h2')).toHaveTextContent('Preview');
  });
});
