import { describe, expect, it } from 'vitest';
import { RichText } from '@atproto/api';
import { BLUESKY_MAX_GRAPHEMES, fitToBluesky, selfLabelsFor } from '../atprotoClient';

const graphemes = (s: string) => new RichText({ text: s }).graphemeLength;

describe('fitToBluesky', () => {
  it('leaves short text alone', () => {
    expect(fitToBluesky('Pride picnic Saturday', graphemes)).toBe('Pride picnic Saturday');
  });

  it('cuts long text to the grapheme limit with an ellipsis', () => {
    const out = fitToBluesky('a'.repeat(400), graphemes);
    expect(graphemes(out)).toBe(BLUESKY_MAX_GRAPHEMES);
    expect(out.endsWith('…')).toBe(true);
  });

  it('never splits a multi-codepoint emoji', () => {
    const flag = '🏳️‍🌈';
    const out = fitToBluesky(flag.repeat(320), graphemes);
    expect(graphemes(out)).toBe(BLUESKY_MAX_GRAPHEMES);
    expect(
      out
        .replace('…', '')
        .split(flag)
        .every((part) => part === ''),
    ).toBe(true);
  });
});

describe('selfLabelsFor', () => {
  it('passes Bluesky self-labels through unchanged', () => {
    expect(selfLabelsFor(['sexual', 'nudity'])).toEqual({
      $type: 'com.atproto.label.defs#selfLabels',
      values: [{ val: 'sexual' }, { val: 'nudity' }],
    });
  });

  it('drops anything that is not a Bluesky self-label, and omits empty sets', () => {
    expect(selfLabelsFor(['!hide', 'spam'])).toBeUndefined();
    expect(selfLabelsFor(null)).toBeUndefined();
  });
});
