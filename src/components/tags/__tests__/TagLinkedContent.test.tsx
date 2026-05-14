import { describe, it, expect } from 'vitest';

// Extract the ranking function for testing by re-implementing it here.
// The actual function is private inside TagLinkedContent — we test the logic.
interface NewsItem {
  id: string;
  title: string;
  excerpt: string | null;
  published_at: string | null;
  image_url: string | null;
  url: string | null;
  news_sources: { name: string } | null;
}

function rankNewsByRelevance(articles: NewsItem[], tagName: string): NewsItem[] {
  if (articles.length === 0) return articles;
  const terms = tagName.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  if (terms.length === 0) return articles;

  return [...articles].sort((a, b) => {
    const textA = `${a.title ?? ''} ${a.excerpt ?? ''}`.toLowerCase();
    const textB = `${b.title ?? ''} ${b.excerpt ?? ''}`.toLowerCase();
    const scoreA = terms.filter((t) => textA.includes(t)).length;
    const scoreB = terms.filter((t) => textB.includes(t)).length;
    return scoreB - scoreA;
  });
}

const makeArticle = (id: string, title: string, excerpt: string | null = null): NewsItem => ({
  id,
  title,
  excerpt,
  published_at: '2026-01-01',
  image_url: null,
  url: null,
  news_sources: null,
});

describe('rankNewsByRelevance (P2-8)', () => {
  it('promotes articles that mention the tag name', () => {
    const articles = [
      makeArticle('1', 'Unrelated headline about politics'),
      makeArticle('2', 'Lesbian visibility day celebrated worldwide'),
      makeArticle('3', 'New study on queer health', 'Lesbian women face unique challenges'),
    ];
    const ranked = rankNewsByRelevance(articles, 'Lesbian');
    expect(ranked[0].id).toBe('2');
    expect(ranked[1].id).toBe('3');
    expect(ranked[2].id).toBe('1');
  });

  it('counts multiple term matches', () => {
    const articles = [
      makeArticle('1', 'Power exchange workshop'),
      makeArticle('2', 'BDSM and power exchange community event'),
    ];
    const ranked = rankNewsByRelevance(articles, 'BDSM Power Exchange');
    // Article 2 matches 'bdsm', 'power', 'exchange' = 3 terms; article 1 matches 'power', 'exchange' = 2
    expect(ranked[0].id).toBe('2');
    expect(ranked[1].id).toBe('1');
  });

  it('returns empty array unchanged', () => {
    expect(rankNewsByRelevance([], 'Leather')).toEqual([]);
  });

  it('skips short terms (≤2 chars)', () => {
    const articles = [
      makeArticle('1', 'An article'),
      makeArticle('2', 'Another article'),
    ];
    // "An" is 2 chars, filtered out; no ranking terms remain
    const ranked = rankNewsByRelevance(articles, 'An');
    expect(ranked[0].id).toBe('1'); // original order preserved
  });
});
