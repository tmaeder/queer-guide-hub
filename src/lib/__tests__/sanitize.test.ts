/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import {
  sanitizeArticle,
  sanitizeDefault,
  sanitizeEditableDocument,
  sanitizeEmailDocument,
  sanitizeEmailReview,
  sanitizeForSummary,
  sanitizeHighlight,
  sanitizeInboundEmail,
  sanitizeLegacyEmail,
  sanitizeSvg,
  sanitizeToText,
  sanitizeUserContent,
} from '../sanitize';

const XSS =
  '<img src=x onerror="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)">x</a>';

/** Every profile must remove these, whatever else it keeps. */
function expectInert(out: string) {
  expect(out).not.toMatch(/<script/i);
  expect(out).not.toMatch(/onerror/i);
  expect(out).not.toMatch(/javascript:/i);
}

const profiles: Array<[string, (html: string) => string]> = [
  ['sanitizeToText', sanitizeToText],
  ['sanitizeUserContent', (h) => sanitizeUserContent(h, ['a', 'img', 'p'], ['href', 'src'])],
  ['sanitizeHighlight', sanitizeHighlight],
  ['sanitizeArticle', sanitizeArticle],
  ['sanitizeDefault', sanitizeDefault],
  ['sanitizeInboundEmail', sanitizeInboundEmail],
  ['sanitizeEmailReview', sanitizeEmailReview],
  ['sanitizeEmailDocument', sanitizeEmailDocument],
  ['sanitizeLegacyEmail', sanitizeLegacyEmail],
  ['sanitizeEditableDocument', (h) => sanitizeEditableDocument(h, true)],
  ['sanitizeForSummary', sanitizeForSummary],
  ['sanitizeSvg', sanitizeSvg],
];

describe.each(profiles)('%s', (_name, profile) => {
  it('strips script, event handlers and javascript: URLs', () => {
    expectInert(profile(XSS));
  });
});

describe('profile-specific policy', () => {
  it('sanitizeToText keeps text and no tags', () => {
    expect(sanitizeToText('<p><b>hi</b> there</p>')).toBe('hi there');
  });

  it('sanitizeHighlight keeps only <em>', () => {
    expect(sanitizeHighlight('<em class="x">a</em><strong>b</strong>')).toBe('<em>a</em>b');
  });

  it('sanitizeUserContent applies the caller allowlist, https/relative links only', () => {
    const out = sanitizeUserContent(
      '<a href="https://x.org" target="_blank">a</a><a href="http://x.org">b</a><div>c</div>',
      ['a'],
      ['href', 'target'],
    );
    // Pinned pre-existing behaviour: DOMPurify drops `target`, and KEEP_CONTENT:false
    // keeps #text out of the allowlist, so element text is removed too.
    expect(out).toBe('<a href="https://x.org"></a><a></a>');
  });

  it('sanitizeArticle keeps heading ids, sanitizeDefault drops nothing structural', () => {
    expect(sanitizeArticle('<h2 id="intro">Intro</h2>')).toBe('<h2 id="intro">Intro</h2>');
    expect(sanitizeDefault('<p class="a">x</p>')).toBe('<p class="a">x</p>');
  });

  it('sanitizeInboundEmail keeps inline style and drops forms', () => {
    const out = sanitizeInboundEmail('<p style="color:red">a</p><form><input></form>');
    expect(out).toContain('style="color:red"');
    expect(out).not.toMatch(/<form|<input/);
  });

  it('sanitizeEmailReview removes every resource URL', () => {
    const out = sanitizeEmailReview('<img src="https://t.example/pixel"><a href="https://x">x</a>');
    expect(out).not.toMatch(/src=|href=/);
  });

  it('sanitizeEmailDocument keeps <style> in a whole document', () => {
    expect(sanitizeEmailDocument('<style>p{}</style><p>a</p>')).toMatch(/<html>.*<style>/s);
  });

  it('sanitizeLegacyEmail keeps inline style but drops <style> blocks', () => {
    const out = sanitizeLegacyEmail('<style>p{}</style><p style="color:red">a</p>');
    expect(out).toBe('<p style="color:red">a</p>');
  });

  it('sanitizeEditableDocument drops form controls and <base>, honours wholeDocument', () => {
    const frag = sanitizeEditableDocument(
      '<p>a</p><style>p{}</style><button>b</button><base href="/">',
      false,
    );
    expect(frag).toContain('<style>');
    expect(frag).not.toMatch(/<button|<base/);
    expect(sanitizeEditableDocument('<p>a</p>', true)).toMatch(/^<html>/);
  });

  it('sanitizeForSummary drops <style> and iframes', () => {
    expect(sanitizeForSummary('<style>x</style><iframe></iframe><p>a</p>')).toBe('<p>a</p>');
  });

  it('sanitizeSvg drops foreignObject', () => {
    const out = sanitizeSvg('<svg><foreignObject><p>x</p></foreignObject><circle r="1"/></svg>');
    expect(out).not.toMatch(/foreignObject/i);
    expect(out).toContain('<circle');
  });
});
