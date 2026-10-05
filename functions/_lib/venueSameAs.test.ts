import { describe, expect, it } from 'vitest';
import { venueSameAs } from './detail';

describe('venueSameAs (crawler JSON-LD)', () => {
  it('includes website and every social profile', () => {
    const out = venueSameAs({
      website: 'https://www.atlantaeagle.com',
      social_links: {
        facebook: 'https://www.facebook.com/atlantaeagle',
        instagram: 'https://www.instagram.com/atlantaeagle',
        twitter: 'https://x.com/atlantaeagle',
      },
    });
    expect(out?.[0]).toBe('https://www.atlantaeagle.com');
    expect(out?.some((u) => /facebook\.com\/atlantaeagle/.test(u))).toBe(true);
    expect(out?.some((u) => /instagram\.com\/atlantaeagle/.test(u))).toBe(true);
    expect(out?.some((u) => /(x|twitter)\.com\/atlantaeagle/.test(u))).toBe(true);
  });

  it('builds a valid Instagram URL when the column holds a full URL', () => {
    const out = venueSameAs({ instagram: 'https://www.instagram.com/atlantisevents/' });
    expect(out).toEqual(['https://instagram.com/atlantisevents']);
    expect(out?.[0]).not.toMatch(/instagram\.com\/https/);
  });

  it('does not add a second Instagram URL when social_links already has one', () => {
    const out = venueSameAs({
      instagram: 'atlantaeagle',
      social_links: { instagram: 'https://www.instagram.com/atlantaeagle' },
    });
    expect(out?.filter((u) => /instagram/.test(u))).toHaveLength(1);
  });

  it('is undefined when there is nothing', () => {
    expect(venueSameAs({})).toBeUndefined();
  });
});
