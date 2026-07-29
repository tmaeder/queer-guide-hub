/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CMSBody } from '../CMSBody';
import { sanitizeCmsHtml } from '@/lib/cms/sanitizeCmsHtml';

describe('sanitizeCmsHtml', () => {
  it('strips scripts and event handlers', () => {
    const dirty = '<p onclick="steal()">hi</p><script>steal()</script>';
    const clean = sanitizeCmsHtml(dirty);
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('onclick');
    expect(clean).toContain('hi');
  });

  it('preserves id attributes so in-page anchors work', () => {
    // The drift this unification fixes: two of the three call sites used to
    // strip ids, breaking heading anchors on /p/:slug and /help.
    expect(sanitizeCmsHtml('<h2 id="rights">Rights</h2>')).toContain('id="rights"');
  });

  it('preserves data attributes used by embedded block placeholders', () => {
    const html = '<div data-block-id="abc" data-entity-type="venue"></div>';
    const clean = sanitizeCmsHtml(html);
    expect(clean).toContain('data-block-id="abc"');
    expect(clean).toContain('data-entity-type="venue"');
  });

  it('returns an empty string for null/undefined/empty input', () => {
    expect(sanitizeCmsHtml(null)).toBe('');
    expect(sanitizeCmsHtml(undefined)).toBe('');
    expect(sanitizeCmsHtml('')).toBe('');
  });
});

describe('CMSBody', () => {
  it('renders sanitized html inside the given wrapper class', () => {
    const { container } = render(<CMSBody html="<p>body copy</p>" className="qg-cms-body" />);
    const wrapper = container.querySelector('.qg-cms-body');
    expect(wrapper).not.toBeNull();
    expect(wrapper?.innerHTML).toBe('<p>body copy</p>');
  });

  it('renders nothing when there is no body', () => {
    const { container } = render(<CMSBody html={null} className="qg-cms-body" />);
    expect(container.firstChild).toBeNull();
  });

  it('does not double-sanitize when preSanitized is set', () => {
    // The legal-page path sanitizes first, then injects heading ids.
    const withIds = '<h2 id="a">A</h2>';
    const { container } = render(<CMSBody html={withIds} preSanitized className="x" />);
    expect(container.querySelector('#a')).not.toBeNull();
  });

  it('still renders nothing for empty preSanitized input', () => {
    const { container } = render(<CMSBody html="" preSanitized className="x" />);
    expect(container.firstChild).toBeNull();
  });
});
