import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Lexicons } from '@atproto/lexicon';
import { activityRecord, activityRkey } from '@/lib/atprotoClient';

const dir = join(process.cwd(), 'lexicons/guide/queer');
const lex = new Lexicons();
for (const f of readdirSync(dir)) lex.add(JSON.parse(readFileSync(join(dir, f), 'utf8')));

const subject = { uri: 'https://queer.guide/venues/eagle', title: 'The Eagle' };

describe('guide.queer lexicons', () => {
  it('parse as valid lexicons and cover all four kinds', () => {
    for (const k of ['checkin', 'review', 'rsvp', 'save']) {
      expect(lex.getDef(`guide.queer.${k}`)?.type).toBe('record');
    }
  });

  it('accept the records the app writes', () => {
    lex.assertValidRecord('guide.queer.checkin', activityRecord('checkin', 'venue', subject));
    lex.assertValidRecord('guide.queer.save', activityRecord('save', 'city', subject));
    lex.assertValidRecord(
      'guide.queer.review',
      activityRecord('review', 'venue', subject, { rating: 4 }),
    );
    lex.assertValidRecord(
      'guide.queer.rsvp',
      activityRecord('rsvp', 'event', subject, { status: 'going' }),
    );
  });

  it('reject a review without a rating, or out of range', () => {
    expect(() =>
      lex.assertValidRecord('guide.queer.review', activityRecord('review', 'venue', subject)),
    ).toThrow();
    expect(() =>
      lex.assertValidRecord(
        'guide.queer.review',
        activityRecord('review', 'venue', subject, { rating: 6 }),
      ),
    ).toThrow();
  });

  it('record keys are valid atproto rkeys and stable per subject', () => {
    const k = activityRkey('venue', '6f1c1b6e-0000-4000-8000-000000000001');
    expect(k).toMatch(/^[A-Za-z0-9._:~-]{1,512}$/);
    expect(k).toBe(activityRkey('venue', '6f1c1b6e-0000-4000-8000-000000000001'));
  });
});
