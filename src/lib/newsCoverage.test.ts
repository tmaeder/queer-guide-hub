import { describe, it, expect } from 'vitest';
import { buildCoverage, countPublishers, coverageLabel, normalizeArticleUrl } from './newsCoverage';
import { isAggregatorUrl } from './publisherName';

// The live cluster /news/story/georgian-lgbtq-rights-group-forced-into-exile-96767dd6
// (rows read from prod 2026-11-27, urls abbreviated where irrelevant).
const georgia = [
  {
    id: 'wb',
    title: 'Georgian LGBTQ rights group forced into exile',
    publisher_name: 'Washington Blade',
    url: 'https://www.washingtonblade.com/2026/11/24/georgian-lgbtq-rights-group-forced-into-exile/?utm_source=rss&#038;utm_medium=rss',
    published_at: '2026-11-24T15:42:10Z',
    fingerprint: '06519d8e6d',
  },
  {
    id: 'gn',
    title: 'Georgian LGBTQ rights group forced into exile - Washington Blade',
    publisher_name: 'Google News LGBT Rights',
    url: 'https://news.google.com/rss/articles/CBMikwFBVV95?oc=5',
    published_at: '2026-11-24T15:44:37Z',
    fingerprint: 'c5975cd33a',
  },
  {
    id: 'lab',
    title: 'Georgian LGBTQ+ rights group forced into exile',
    publisher_name: 'Los Angeles Blade',
    url: 'https://www.losangelesblade.com/2026/11/24/georgian-lgbtq-rights-group-forced-into-exile/',
    published_at: '2026-11-24T15:52:29Z',
    fingerprint: 'eae5bcaec5',
  },
  {
    id: 'ln',
    title: 'LGBTQ+ rights group forced to flee Georgia after years of violent attacks',
    publisher_name: 'LGBTQ Nation',
    url: 'https://www.lgbtqnation.com/2026/11/lgbtq-rights-group-forced-to-flee-georgia-after-years-of-attacks/',
    published_at: '2026-11-25T18:00:00Z',
  },
  {
    id: 'gcn',
    title: 'Georgia LGBTQ+ rights group forced into exile after violent government crackdowns',
    publisher_name: 'GCN',
    url: 'https://gcn.ie/georgia-lgbtq-rights-group-exile-after-crackdowns/',
    published_at: '2026-11-26T13:58:35Z',
  },
  {
    id: 'pn',
    title: 'LGBTQ+ rights group forced to relocate to Brussels amid Georgia government crackdown',
    publisher_name: 'Pink News',
    url: 'https://www.thepinknews.com/2026/11/26/tbilisi-pride-brussels-2026/',
    published_at: '2026-11-26T15:56:26Z',
  },
];

describe('buildCoverage', () => {
  it('folds an aggregator listing into the report it re-lists', () => {
    const items = buildCoverage(georgia);
    expect(items.map((i) => i.article.id)).toEqual(['wb', 'lab', 'ln', 'gcn', 'pn']);
    expect(items[0].alsoListedBy).toEqual(['Google News LGBT Rights']);
  });

  it('marks an identical headline from another publisher, keeps it, keeps chronology', () => {
    const items = buildCoverage(georgia);
    expect(items.find((i) => i.article.id === 'lab')!.sameHeadlineAs).toBe('Washington Blade');
    expect(items.find((i) => i.article.id === 'ln')!.sameHeadlineAs).toBeNull();
  });

  it('counts publishers, not feed rows', () => {
    expect(countPublishers(buildCoverage(georgia))).toBe(5);
  });

  it('collapses the same canonical URL and the same fingerprint', () => {
    const a = { id: 'a', title: 'One', url: 'https://x.com/a?utm=1', published_at: '2026-01-01' };
    const b = { id: 'b', title: 'Two', url: 'https://www.x.com/a/', published_at: '2026-01-02' };
    const c = {
      id: 'c',
      title: 'Three',
      url: 'https://y.com/c',
      published_at: '2026-01-03',
      fingerprint: 'f',
    };
    const d = {
      id: 'd',
      title: 'Four',
      url: 'https://y.com/d',
      published_at: '2026-01-04',
      fingerprint: 'f',
    };
    expect(buildCoverage([a, b, c, d]).map((i) => i.article.id)).toEqual(['a', 'c']);
  });

  it('keeps an aggregator listing whose outlet is otherwise absent, named for that outlet', () => {
    const items = buildCoverage([
      {
        id: 'g',
        title: 'Story - The Advocate',
        url: 'https://news.google.com/rss/x',
        published_at: '2026-01-01',
        publisher_name: 'Google News',
      },
    ]);
    expect(items[0].publisher).toBe('The Advocate');
  });
});

describe('coverageLabel', () => {
  it('states article and publisher counts and never claims verification', () => {
    expect(coverageLabel(6, 5).defaultValue).toBe(
      'Coverage in {{count}} articles from {{publishers}} publishers',
    );
    expect(coverageLabel(3, 3).defaultValue).toBe('Coverage from {{publishers}} publishers');
    expect(coverageLabel(4, 1).defaultValue).toBe('Coverage in {{count}} articles');
    for (const [a, p] of [
      [6, 5],
      [3, 3],
      [4, 1],
      [2, 0],
    ]) {
      expect(coverageLabel(a, p).defaultValue).not.toMatch(/orroborat|verif|independent/i);
    }
  });
});

describe('helpers', () => {
  it('normalizes article urls and detects aggregators', () => {
    expect(normalizeArticleUrl('https://www.a.com/x/?q=1#f')).toBe('a.com/x');
    expect(isAggregatorUrl('https://news.google.com/rss/articles/abc')).toBe(true);
    expect(isAggregatorUrl('https://www.thepinknews.com/a')).toBe(false);
  });
});
