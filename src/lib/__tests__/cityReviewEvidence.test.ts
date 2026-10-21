import { describe, expect, it } from 'vitest';
import { hasCityReviewEvidence } from '../../../supabase/functions/_shared/city-review-evidence';
describe('city proposal intake evidence', () => {
  it('refuses the national-law citations that created the live local rating backlog', () => {
    for (const country of ['Spain', 'France', 'the_United_States', 'Mexico']) {
      expect(
        hasCityReviewEvidence('lgbt_friendly_rating', [
          {
            url: `https://en.wikipedia.org/wiki/LGBT_rights_in_${country}`,
            quote: 'The country has a high level of acceptance of LGBTQ+ people.',
          },
        ]),
      ).toBe(false);
    }
    expect(
      hasCityReviewEvidence('lgbt_friendly_rating', [
        { url: 'https://example.org', quote: 'France has an equality score of 100.' },
      ]),
    ).toBe(false);
  });
  it('requires a usable source quotation before generating prose review work', () => {
    expect(hasCityReviewEvidence('editorial_hook', [])).toBe(false);
    expect(
      hasCityReviewEvidence('best_time_to_visit', [
        { url: 'javascript:alert(1)', quote: 'Visit during the summer festival in July.' },
      ]),
    ).toBe(false);
    expect(hasCityReviewEvidence('editorial_hook', [{ url: 'https://example.org' }])).toBe(false);
    expect(
      hasCityReviewEvidence('editorial_hook', [
        {
          url: 'https://user:secret@example.org',
          quote: 'An established community centre in the district.',
        },
      ]),
    ).toBe(false);
  });
  it('preserves cited timing and local LGBTQ evidence for review', () => {
    expect(
      hasCityReviewEvidence('best_time_to_visit', [
        {
          url: 'https://tourism.example/festival',
          quote: 'The annual city festival runs in July.',
        },
      ]),
    ).toBe(true);
    expect(
      hasCityReviewEvidence('lgbt_friendly_rating', [
        {
          url: 'https://tourism.example/lgbt',
          quote: 'The city has an established LGBTQ district and community centre.',
        },
      ]),
    ).toBe(true);
  });
});
