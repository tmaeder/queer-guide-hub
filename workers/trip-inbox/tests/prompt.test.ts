import { describe, expect, it } from 'vitest';
import {
  buildUserMessage,
  parseLLMResponse,
  SYSTEM_PROMPT,
} from '../src/prompt';
import { extractShortId } from '../src/index';

describe('SYSTEM_PROMPT', () => {
  it('enumerates the six allowed types', () => {
    for (const t of ['lodging', 'flight', 'rail', 'restaurant', 'activity', 'unknown']) {
      expect(SYSTEM_PROMPT).toContain(`"${t}"`);
    }
  });
  it('asks for confidence', () => {
    expect(SYSTEM_PROMPT.toLowerCase()).toContain('confidence');
  });
});

describe('buildUserMessage', () => {
  it('packs from/subject/body', () => {
    const out = buildUserMessage({
      from: 'noreply@booking.com',
      subject: 'Your reservation is confirmed',
      body: 'Hotel Lutetia, Paris — check-in 2026-06-01',
    });
    expect(out).toContain('From: noreply@booking.com');
    expect(out).toContain('Subject: Your reservation is confirmed');
    expect(out).toContain('Hotel Lutetia');
  });
  it('truncates oversized bodies', () => {
    const big = 'x'.repeat(20000);
    const out = buildUserMessage({ from: 'a', subject: 'b', body: big });
    expect(out.length).toBeLessThanOrEqual(12000 + 100); // body cap + headers
  });
});

describe('parseLLMResponse', () => {
  it('parses a clean JSON response', () => {
    const json = JSON.stringify({
      type: 'lodging',
      vendor: 'Booking.com',
      title: 'Hotel Lutetia',
      start: '2026-06-01T15:00:00+02:00',
      end: '2026-06-04T11:00:00+02:00',
      location: 'Paris, France',
      price: 482.5,
      currency: 'EUR',
      confirmation: 'ABC123',
      confidence: 0.94,
    });
    const out = parseLLMResponse(json);
    expect(out.type).toBe('lodging');
    expect(out.price).toBe(482.5);
    expect(out.currency).toBe('EUR');
    expect(out.confidence).toBeCloseTo(0.94);
  });

  it('strips ```json fences', () => {
    const out = parseLLMResponse('```json\n{"type":"flight","confidence":0.8}\n```');
    expect(out.type).toBe('flight');
  });

  it('falls back to unknown on garbage', () => {
    const out = parseLLMResponse('not json at all');
    expect(out.type).toBe('unknown');
    expect(out.confidence).toBe(0);
  });

  it('clamps confidence to [0,1]', () => {
    const high = parseLLMResponse('{"type":"flight","confidence":1.4}');
    expect(high.confidence).toBe(1);
    const low = parseLLMResponse('{"type":"flight","confidence":-0.2}');
    expect(low.confidence).toBe(0);
  });

  it('rejects unknown type values', () => {
    const out = parseLLMResponse('{"type":"spaceship","confidence":0.9}');
    expect(out.type).toBe('unknown');
  });
});

describe('extractShortId', () => {
  it('matches trip-<id>@<domain>', () => {
    expect(extractShortId('trip-abc123def@inbox.queer.guide', 'inbox.queer.guide'))
      .toBe('abc123def');
  });
  it('is case-insensitive', () => {
    expect(extractShortId('Trip-ABC123def@INBOX.queer.guide', 'inbox.queer.guide'))
      .toBe('abc123def');
  });
  it('rejects wrong domain', () => {
    expect(extractShortId('trip-abc123def@other.com', 'inbox.queer.guide')).toBeNull();
  });
  it('rejects local-parts that do not match', () => {
    expect(extractShortId('hello@inbox.queer.guide', 'inbox.queer.guide')).toBeNull();
    expect(extractShortId('trip-@inbox.queer.guide', 'inbox.queer.guide')).toBeNull();
  });
});
