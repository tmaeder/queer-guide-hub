import { describe, expect, it } from 'vitest';
import { guideVoice, sourceLabel } from '../guideVoice';

describe('guideVoice', () => {
  it('uses the support voice for service guides (prod: lgbtq-services-that-get-it)', () => {
    expect(guideVoice({ format: 'guide', category: 'services' })).toBe('support');
    expect(guideVoice({ format: 'guide', category: 'Mental health' })).toBe('support');
  });

  it('keeps shopping lists and editorial guides distinct', () => {
    expect(guideVoice({ format: 'list', category: 'shopping' })).toBe('shopping');
    expect(guideVoice({ format: 'guide', category: 'sauna' })).toBe('editorial');
    expect(guideVoice({ format: 'quest', category: 'services' })).toBe('editorial');
    expect(guideVoice({ format: 'guide', category: null })).toBe('editorial');
  });
});

describe('sourceLabel', () => {
  it('names the host', () => {
    expect(sourceLabel('https://www.schwulenberatungberlin.de/angebote')).toBe(
      'schwulenberatungberlin.de',
    );
    expect(sourceLabel('not a url')).toBeNull();
  });
});
