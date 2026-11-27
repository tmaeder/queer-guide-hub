import { describe, it, expect } from 'vitest';
// @ts-expect-error - plain .mjs operator script, no types
import { linkInvitations } from '../../../../scripts/data-quality/repair-cms-contribution-links.mjs';

describe('repair-cms-contribution-links', () => {
  const body =
    '<ul><li><strong>Add Venues</strong> — Share</li><li><strong>Create Events</strong> — x</li>' +
    '<li><strong>Join Discussions</strong> — y</li><li><strong>Spread the Word</strong> — z</li></ul>';

  it('links each invitation to a real route and keeps the wording', () => {
    const { html, linked } = linkInvitations(body);
    expect(linked).toEqual(['Add Venues', 'Create Events', 'Join Discussions']);
    expect(html).toContain('<a href="/submit/venue"><strong>Add Venues</strong></a>');
    expect(html).toContain('<a href="/submit/event"><strong>Create Events</strong></a>');
    expect(html).toContain('<a href="/meet/groups"><strong>Join Discussions</strong></a>');
    expect(html).toContain('<strong>Spread the Word</strong> — z');
  });

  it('is idempotent', () => {
    const once = linkInvitations(body).html;
    expect(linkInvitations(once)).toEqual({ html: once, linked: [] });
  });
});
