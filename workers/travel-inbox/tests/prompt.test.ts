import { describe, expect, it } from 'vitest';
import {
  buildUserMessage,
  parseLLMResponse,
  SYSTEM_PROMPT,
  toStoredType,
} from '../src/prompt';
import { extractLocalPart } from '../src/index';

describe('SYSTEM_PROMPT', () => {
  it('names the target providers', () => {
    for (const brand of ['Booking.com', 'Airbnb', 'Lufthansa']) {
      expect(SYSTEM_PROMPT).toContain(brand);
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
    expect(out.length).toBeLessThanOrEqual(12000 + 100);
  });
});

describe('parseLLMResponse', () => {
  it('parses a clean Booking.com lodging response', () => {
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
    expect(out.vendor).toBe('Booking.com');
    expect(out.price).toBe(482.5);
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
    expect(parseLLMResponse('{"type":"flight","confidence":1.4}').confidence).toBe(1);
    expect(parseLLMResponse('{"type":"flight","confidence":-0.2}').confidence).toBe(0);
  });
});

describe('toStoredType', () => {
  it('passes booking types through', () => {
    expect(toStoredType('lodging')).toBe('lodging');
    expect(toStoredType('flight')).toBe('flight');
    expect(toStoredType('unknown')).toBe('unknown');
  });
  it('collapses announcements to unknown (not stored in a personal inbox)', () => {
    expect(toStoredType('event')).toBe('unknown');
    expect(toStoredType('venue')).toBe('unknown');
  });
});

describe('extractLocalPart', () => {
  it('extracts a username on the apex domain', () => {
    expect(extractLocalPart('tobias@queer.guide', 'queer.guide')).toBe('tobias');
  });
  it('is case-insensitive', () => {
    expect(extractLocalPart('Tobias@QUEER.guide', 'queer.guide')).toBe('tobias');
  });
  it('strips a +subaddress tag', () => {
    expect(extractLocalPart('tobias+booking@queer.guide', 'queer.guide')).toBe('tobias');
  });
  it('rejects the wrong domain', () => {
    expect(extractLocalPart('tobias@inbox.queer.guide', 'queer.guide')).toBeNull();
  });
  it('drops reserved role mailboxes', () => {
    for (const r of ['submit', 'tip', 'press', 'bug', 'feedback', 'admin', 'noreply']) {
      expect(extractLocalPart(`${r}@queer.guide`, 'queer.guide')).toBeNull();
    }
  });
  it('rejects malformed local-parts', () => {
    expect(extractLocalPart('a@queer.guide', 'queer.guide')).toBeNull(); // too short
    expect(extractLocalPart('.nope@queer.guide', 'queer.guide')).toBeNull(); // bad start
    expect(extractLocalPart('no@queer.guide', 'queer.guide')).toBeNull(); // 2 chars < min
  });
});
