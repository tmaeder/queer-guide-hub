import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TAG_RIGHT_TOPIC, rightTopicForTag, rightTopicHref } from '../tagRightTopics';
import { RIGHT_TOPICS } from '../rightsCatalog';

describe('TAG_RIGHT_TOPIC', () => {
  it('every mapped topic slug exists in RIGHT_TOPICS', () => {
    // The whole reason this mapping is TypeScript and not a Postgres column:
    // nothing can FK-constrain it, so a typo would ship as a dead link.
    const known = new Set(RIGHT_TOPICS.map((r) => r.slug));
    const unknown = Object.entries(TAG_RIGHT_TOPIC).filter(([, topic]) => !known.has(topic));
    expect(unknown).toEqual([]);
  });

  it('tag slugs are lowercase kebab, matching unified_tags.slug', () => {
    const bad = Object.keys(TAG_RIGHT_TOPIC).filter((s) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s));
    expect(bad).toEqual([]);
  });

  it('resolves a mapped tag to its topic and an unmapped one to undefined', () => {
    expect(rightTopicForTag('marriage-equality')?.slug).toBe('marriage');
    expect(rightTopicForTag('same-sex-marriage')?.slug).toBe('marriage');
    expect(rightTopicForTag('decriminalization')?.slug).toBe('criminalisation');
    expect(rightTopicForTag('bear-bar')).toBeUndefined();
    expect(rightTopicForTag(null)).toBeUndefined();
    expect(rightTopicForTag(undefined)).toBeUndefined();
  });
});

describe('rightTopicHref', () => {
  const topic = RIGHT_TOPICS[0];

  it('points at an anchor on /rights, not a per-topic path', () => {
    expect(rightTopicHref(topic)).toBe(`/rights#${topic.slug}`);
  });

  it('targets a route that actually exists', () => {
    // `/rights/<slug>` is NOT a route — routes.tsx declares only `rights` and
    // `rights/sources`, and a `:right` param would tie with `/:locale` and resolve
    // to NotFound. Reading the route table keeps this honest if either changes.
    const routes = readFileSync(resolve(__dirname, '../../../routes.tsx'), 'utf8');
    expect(routes).toMatch(/path="rights"/);
    for (const t of RIGHT_TOPICS) {
      expect(routes).not.toMatch(new RegExp(`path="rights/${t.slug}"`));
    }
  });

  it('every mapped topic has an anchor target rendered on /rights', () => {
    // The anchor only resolves because Rights.tsx stamps id={topic.slug} on each
    // card. Without that line the links are silently inert.
    const page = readFileSync(resolve(__dirname, '../../../pages/intent/Rights.tsx'), 'utf8');
    expect(page).toMatch(/id=\{topic\.slug\}/);
  });
});
