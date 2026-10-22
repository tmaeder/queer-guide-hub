import { describe, expect, it } from 'vitest';
import { stripEmailEditorMetadata } from '../../../../../supabase/functions/_shared/email-template-content';
import {
  emailBody,
  missingTokens,
  prepareLegacyHtml,
  readBlockDocument,
  renderSample,
  reviewDocument,
  storeBlockDocument,
} from '../emailDocument';

describe('email document compatibility', () => {
  it('stores Unicode block data alongside sendable HTML and round trips it', () => {
    const document = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Grüezi 🌈' }] }],
    };
    const stored = storeBlockDocument('<html><body><p>Grüezi 🌈</p></body></html>', document);
    expect(readBlockDocument(stored)).toEqual(document);
    expect(stored).toContain('<p>Grüezi 🌈</p>');
    expect(stored).not.toContain('<html');
    expect(stripEmailEditorMetadata(stored)).toBe('<p>Grüezi 🌈</p>');
  });
  it('preserves legacy templates until conversion and safely wraps visible variable text', () => {
    expect(readBlockDocument('<h1>Legacy {{name}}</h1>')).toBeNull();
    const prepared = prepareLegacyHtml(
      '<h1>Hello {{name}}</h1><a href="{{url}}">Continue</a><script>alert(1)</script>',
    );
    expect(prepared).toContain('data-email-variable="name"');
    expect(prepared).toContain('href="{{url}}"');
    expect(prepared).not.toContain('<script');
  });
  it('falls back on malformed block metadata', () => {
    expect(
      readBlockDocument('<!--queer-guide-email-blocks:v1:bm90LWpzb24=--><p>Email</p>'),
    ).toBeNull();
  });
  it('requires variables used by the original while allowing reordering and duplicates', () => {
    expect(missingTokens('{{name}} {{url}}', '{{url}} {{name}} {{name}}')).toEqual([]);
    expect(missingTokens('{{name}} <a href="{{url}}">Go</a>', '{{name}}')).toEqual(['url']);
  });
  it('uses literal substitution and HTML escapes samples separately from plain text', () => {
    const samples = { name: '<b>$&</b>' };
    expect(renderSample('Hello {{name}}', samples)).toBe('Hello <b>$&</b>');
    expect(renderSample('<p>{{name}}</p>', samples, true)).toBe('<p>&lt;b&gt;$&amp;&lt;/b&gt;</p>');
    expect(renderSample('{{unknown}}', samples)).toBe('{{unknown}}');
  });
  it('exports a body fragment and removes active content', () => {
    expect(
      emailBody(
        '<html><head><style>p{color:red}</style></head><body><p onclick="bad()">Email</p><script>bad()</script></body></html>',
      ),
    ).toBe('<style>p{color:red}</style><p>Email</p>');
  });
});

describe('campaign review isolation', () => {
  it('prevents content review from fetching trackers or executing template markup', () => {
    const result = reviewDocument(
      '<script>fetch("/admin")</script><img src="https://tracker.invalid/pixel" onerror="bad()"><a href="https://tracker.invalid/click">Link</a><form action="/change"><input></form><p>Saved content</p>',
    );
    expect(result).toContain("default-src 'none'");
    expect(result).toContain("form-action 'none'");
    expect(result).toContain('Saved content');
    expect(result).not.toContain('tracker.invalid');
    expect(result).not.toContain('<script');
    expect(result).not.toContain('onerror');
    expect(result).not.toContain('<form');
  });
});
