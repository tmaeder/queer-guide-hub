import { describe, it, expect } from 'vitest';
import { preClassify, computeReviewPriority, type SensitivityFlag } from '../contentClassification';

// ---------------------------------------------------------------------------
// preClassify — LGBTI relevance signals
// ---------------------------------------------------------------------------

describe('preClassify', () => {
  describe('LGBTI strong signals', () => {
    it('detects explicit LGBTQ+ keywords', () => {
      const result = preClassify({
        content_type: 'venues',
        title: 'The Eagle — Gay Bar & Leather Lounge',
        description: 'Popular gay bar in the Castro district',
      });
      expect(result.strongSignals).toBeGreaterThanOrEqual(2);
    });

    it('detects Pride events', () => {
      const result = preClassify({
        content_type: 'events',
        title: 'Berlin Pride Parade 2026',
        description: 'Annual pride march through Berlin',
      });
      expect(result.strongSignals).toBeGreaterThanOrEqual(1);
    });

    it('detects trans rights content', () => {
      const result = preClassify({
        content_type: 'news_articles',
        title: 'New trans rights legislation passes in Spain',
        description: 'Gender identity law allows self-determination',
      });
      expect(result.strongSignals).toBeGreaterThanOrEqual(2);
    });

    it('detects marriage equality', () => {
      const result = preClassify({
        content_type: 'news_articles',
        title: 'Same-sex marriage legalized in Thailand',
      });
      expect(result.strongSignals).toBeGreaterThanOrEqual(1);
    });

    it('returns 0 strong signals for generic content', () => {
      const result = preClassify({
        content_type: 'venues',
        title: 'Italian Restaurant Da Luigi',
        description: 'Traditional Italian cuisine in the heart of Rome',
      });
      expect(result.strongSignals).toBe(0);
    });
  });

  describe('LGBTI weak signals', () => {
    it('detects rainbow/inclusive language', () => {
      const result = preClassify({
        content_type: 'venues',
        title: 'Rainbow Cafe — Inclusive Safe Space',
      });
      expect(result.weakSignals).toBeGreaterThanOrEqual(1);
    });

    it('detects kink/fetish terms', () => {
      const result = preClassify({
        content_type: 'events',
        title: 'Berlin Kink Festival',
        description: 'Annual BDSM and fetish community event with leather gear',
      });
      expect(result.weakSignals).toBeGreaterThanOrEqual(1);
    });
  });

  describe('known LGBTI sources', () => {
    it('recognizes PinkNews', () => {
      const result = preClassify({
        content_type: 'news_articles',
        title: 'Some article',
        source: 'pinknews.co.uk',
      });
      expect(result.knownSource).toBe(true);
    });

    it('recognizes Queerty', () => {
      const result = preClassify({
        content_type: 'news_articles',
        title: 'Some article',
        source: 'queerty.com',
      });
      expect(result.knownSource).toBe(true);
    });

    it('does not flag generic sources', () => {
      const result = preClassify({
        content_type: 'news_articles',
        title: 'Some article',
        source: 'bbc.co.uk',
      });
      expect(result.knownSource).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Sensitivity detection
  // ---------------------------------------------------------------------------

  describe('legal sensitivity', () => {
    it('detects criminalization language', () => {
      const result = preClassify({
        content_type: 'news_articles',
        title: 'Uganda criminalizes homosexuality with death penalty',
        description: 'Anti-homosexuality act signed into law',
      });
      expect(result.sensitivity.legal.length).toBeGreaterThanOrEqual(2);
    });

    it('detects hate crime references', () => {
      const result = preClassify({
        content_type: 'news_articles',
        title: 'Hate crime against trans woman in Texas',
      });
      expect(result.sensitivity.legal).toContainEqual(expect.stringMatching(/hate crime/i));
    });

    it('detects asylum/refugee context', () => {
      const result = preClassify({
        content_type: 'news_articles',
        title: 'LGBTQ+ asylum seekers face detention',
      });
      expect(result.sensitivity.legal.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('medical sensitivity', () => {
    it('detects HIV/PrEP content', () => {
      const result = preClassify({
        content_type: 'news_articles',
        title: 'New PrEP guidelines for HIV prevention',
        description: 'CDC updates antiretroviral prevention recommendations',
      });
      expect(result.sensitivity.medical.length).toBeGreaterThanOrEqual(1);
    });

    it('detects gender-affirming care', () => {
      const result = preClassify({
        content_type: 'news_articles',
        title: 'State bans gender-affirming care for minors',
        description: 'Hormone therapy and puberty blockers restricted',
      });
      expect(result.sensitivity.medical.length).toBeGreaterThanOrEqual(1);
    });

    it('detects mental health content', () => {
      const result = preClassify({
        content_type: 'news_articles',
        title: 'LGBTQ+ youth mental health crisis',
        description: 'Rising rates of depression and suicide among queer teens',
      });
      expect(result.sensitivity.medical).toContainEqual(expect.stringMatching(/mental health/i));
    });
  });

  describe('NSFW sensitivity', () => {
    it('detects adult venues', () => {
      const result = preClassify({
        content_type: 'venues',
        title: 'Berghain Dark Room — Sex Club and Cruising Bar',
        description: 'Adult-only cruising area and bathhouse with darkroom',
      });
      expect(result.sensitivity.nsfw.length).toBeGreaterThanOrEqual(1);
    });

    it('detects explicit event content', () => {
      const result = preClassify({
        content_type: 'events',
        title: 'Folsom Europe — Fetish Sex Party',
        description: 'BDSM and leather event with darkroom, 18+',
      });
      expect(result.sensitivity.nsfw.length).toBeGreaterThanOrEqual(1);
    });

    it('does not flag regular bars', () => {
      const result = preClassify({
        content_type: 'venues',
        title: 'The Stag — Cocktail Bar',
        description: 'Trendy cocktail bar with great music',
      });
      expect(result.sensitivity.nsfw.length).toBe(0);
    });
  });

  describe('combined signals', () => {
    it('detects multiple sensitivity categories simultaneously', () => {
      const result = preClassify({
        content_type: 'news_articles',
        title: 'Court ruling on conversion therapy ban',
        description: 'Supreme court upholds ban on conversion therapy, a discredited psychiatric treatment',
      });
      expect(result.sensitivity.legal.length).toBeGreaterThanOrEqual(1);
      expect(result.sensitivity.medical.length).toBeGreaterThanOrEqual(1);
    });

    it('handles empty/minimal input gracefully', () => {
      const result = preClassify({
        content_type: 'venues',
        title: '',
      });
      expect(result.strongSignals).toBe(0);
      expect(result.weakSignals).toBe(0);
      expect(result.knownSource).toBe(false);
      expect(result.sensitivity.legal).toHaveLength(0);
      expect(result.sensitivity.medical).toHaveLength(0);
      expect(result.sensitivity.nsfw).toHaveLength(0);
    });

    it('uses tags for classification', () => {
      const result = preClassify({
        content_type: 'venues',
        title: 'Some venue',
        tags: ['gay-bar', 'leather', 'cruising'],
      });
      expect(result.strongSignals).toBeGreaterThanOrEqual(1);
    });
  });
});

// ---------------------------------------------------------------------------
// computeReviewPriority
// ---------------------------------------------------------------------------

describe('computeReviewPriority', () => {
  const makeSensitivityFlag = (
    category: 'legal' | 'medical' | 'nsfw',
    severity: 'low' | 'medium' | 'high' = 'medium',
  ): SensitivityFlag => ({
    category,
    confidence: 0.8,
    indicators: ['test'],
    severity,
  });

  it('returns "low" for high relevance with no flags', () => {
    expect(computeReviewPriority(0.9, [])).toBe('low');
  });

  it('returns "normal" for uncertain relevance (0.5-0.7)', () => {
    expect(computeReviewPriority(0.6, [])).toBe('normal');
  });

  it('returns "normal" for high relevance with low-severity flags', () => {
    expect(computeReviewPriority(0.9, [makeSensitivityFlag('medical', 'low')])).toBe('normal');
  });

  it('returns "high" for any high-severity flag', () => {
    expect(computeReviewPriority(0.9, [makeSensitivityFlag('legal', 'high')])).toBe('high');
  });

  it('returns "high" for multiple sensitivity categories', () => {
    expect(computeReviewPriority(0.9, [
      makeSensitivityFlag('legal', 'medium'),
      makeSensitivityFlag('medical', 'medium'),
    ])).toBe('high');
  });

  it('returns "urgent" for low relevance + high-severity flags', () => {
    expect(computeReviewPriority(0.3, [makeSensitivityFlag('nsfw', 'high')])).toBe('urgent');
  });

  it('returns "urgent" for legal + nsfw combo', () => {
    expect(computeReviewPriority(0.8, [
      makeSensitivityFlag('legal', 'medium'),
      makeSensitivityFlag('nsfw', 'medium'),
    ])).toBe('urgent');
  });

  it('returns "normal" for low relevance with no flags', () => {
    expect(computeReviewPriority(0.4, [])).toBe('normal');
  });
});
