import { describe, it, expect } from 'vitest';
import {
  isOpenNow,
  isAlwaysOpen,
  selectPrimaryLine,
  sortByAvailability,
  hotlineChannels,
  nonVoiceChannels,
  channelHref,
  isDirectory,
} from '../helpData';
import type { Hotline } from '@/types/cms';

function line(over: Partial<Hotline> = {}): Hotline {
  return {
    id: 'x',
    name: 'X',
    country: 'DE',
    phone: '0800 000',
    topics: [],
    languages: [],
    hours: 'Mo–Fr 10–18',
    description: '',
    ...over,
  };
}

/** 2026-08-11 is a Tuesday (day 2). */
const tueBerlin1500 = new Date('2026-08-11T13:00:00Z'); // 15:00 Europe/Berlin (CEST)
const tueBerlin0900 = new Date('2026-08-11T07:00:00Z'); // 09:00 Europe/Berlin

describe('isOpenNow', () => {
  it('returns true for an always-open line', () => {
    expect(isOpenNow(line({ always_open: true, hours: 'anything' }))).toBe(true);
  });

  it('falls back to the legacy 24/7 free-text probe', () => {
    expect(isAlwaysOpen(line({ hours: '24/7' }))).toBe(true);
    expect(isAlwaysOpen(line({ hours: 'Rund um die Uhr' }))).toBe(true);
  });

  // The whole point of the null contract: unknown must never read as closed.
  it('returns null — never false — when hours cannot be structured', () => {
    expect(isOpenNow(line({ hours: 'Check website' }))).toBeNull();
    expect(isOpenNow(line({ hours_slots: [], timezone: 'Europe/Berlin' }))).toBeNull();
  });

  it('returns null when slots exist but the timezone is missing', () => {
    expect(isOpenNow(line({ hours_slots: [{ day: 2, open: '10:00', close: '18:00' }] }))).toBeNull();
  });

  it('returns null for an unrecognised IANA zone rather than guessing', () => {
    expect(
      isOpenNow(
        line({ hours_slots: [{ day: 2, open: '10:00', close: '18:00' }], timezone: 'Mars/Olympus' }),
        tueBerlin1500,
      ),
    ).toBeNull();
  });

  it('resolves a same-day slot in the line’s own timezone', () => {
    const h = line({
      hours_slots: [{ day: 2, open: '10:00', close: '18:00' }],
      timezone: 'Europe/Berlin',
    });
    expect(isOpenNow(h, tueBerlin1500)).toBe(true);
    expect(isOpenNow(h, tueBerlin0900)).toBe(false);
  });

  it('uses the LINE’s clock, not the viewer’s', () => {
    // 15:00 in Berlin is 23:00 in Sydney — an AU line open 10:00–18:00 local
    // is closed at that instant even though the viewer's clock says 15:00.
    const au = line({
      country: 'AU',
      hours_slots: [{ day: 2, open: '10:00', close: '18:00' }],
      timezone: 'Australia/Sydney',
    });
    expect(isOpenNow(au, tueBerlin1500)).toBe(false);
  });

  it('handles a slot that ends at midnight', () => {
    // QLife's shape: "Daily 15:00–24:00".
    const h = line({
      hours_slots: [{ day: 2, open: '15:00', close: '24:00' }],
      timezone: 'Europe/Berlin',
    });
    expect(isOpenNow(h, tueBerlin1500)).toBe(true);
    expect(isOpenNow(h, tueBerlin0900)).toBe(false);
  });

  it('handles a slot running past midnight into the next day', () => {
    // Monday 20:00 → Tuesday 02:00. At Tuesday 01:00 the line is open.
    const h = line({
      hours_slots: [{ day: 1, open: '20:00', close: '02:00' }],
      timezone: 'Europe/Berlin',
    });
    const tue0100 = new Date('2026-08-10T23:00:00Z'); // 01:00 Tue in Berlin
    const tue1500 = tueBerlin1500;
    expect(isOpenNow(h, tue0100)).toBe(true);
    expect(isOpenNow(h, tue1500)).toBe(false);
  });

  it('skips unparseable times without claiming closed for the whole line', () => {
    const h = line({
      hours_slots: [
        { day: 2, open: 'noon', close: 'evening' },
        { day: 2, open: '10:00', close: '18:00' },
      ],
      timezone: 'Europe/Berlin',
    });
    expect(isOpenNow(h, tueBerlin1500)).toBe(true);
  });
});

describe('selectPrimaryLine', () => {
  it('never returns a directory', () => {
    const hotlines = [
      line({ id: 'dir', kind: 'directory', phone: null, always_open: true, free: true }),
    ];
    expect(selectPrimaryLine(hotlines, 'DE')).toBeNull();
  });

  it('returns null for the ALL scope rather than picking a random country', () => {
    expect(selectPrimaryLine([line({ always_open: true })], 'ALL')).toBeNull();
  });

  it('prefers a line that is open right now over one that is closed', () => {
    const open = line({
      id: 'open-now',
      hours_slots: [{ day: 2, open: '10:00', close: '18:00' }],
      timezone: 'Europe/Berlin',
    });
    const closed = line({
      id: 'closed',
      free: true,
      anonymous: true,
      topics: ['a', 'b', 'c', 'd', 'e'],
      hours_slots: [{ day: 2, open: '20:00', close: '22:00' }],
      timezone: 'Europe/Berlin',
    });
    expect(selectPrimaryLine([closed, open], 'DE', tueBerlin1500)?.id).toBe('open-now');
  });

  it('still prefers a 24/7 line over one that closes later today', () => {
    // Not a contradiction of the above: someone may still be on this page in
    // an hour, so round-the-clock outranks open-for-now among open lines.
    const open = line({
      id: 'open-now',
      hours_slots: [{ day: 2, open: '10:00', close: '18:00' }],
      timezone: 'Europe/Berlin',
    });
    const always = line({ id: 'always', always_open: true });
    expect(selectPrimaryLine([always, open], 'DE', tueBerlin1500)?.id).toBe('always');
  });

  it('penalises a line that may contact police without consent', () => {
    const carceral = line({ id: 'carceral', always_open: true, free: true, reports_to_police: true });
    const safe = line({ id: 'safe', always_open: true, free: true });
    expect(selectPrimaryLine([carceral, safe], 'DE')?.id).toBe('safe');
  });

  it('is unaffected by which lines a search would have filtered out', () => {
    // Regression: the JSON-LD hero used to derive from the filtered list, so a
    // keystroke rewrote the page's EmergencyService structured data.
    const all = [line({ id: 'a', always_open: true, free: true }), line({ id: 'b' })];
    expect(selectPrimaryLine(all, 'DE')?.id).toBe('a');
    expect(selectPrimaryLine([all[0]], 'DE')?.id).toBe('a');
  });
});

describe('sortByAvailability', () => {
  it('ranks open-now above unknown, and unknown above known-closed', () => {
    const openNow = line({
      id: 'open',
      hours_slots: [{ day: 2, open: '10:00', close: '18:00' }],
      timezone: 'Europe/Berlin',
    });
    const unknown = line({ id: 'unknown', hours: 'Check website' });
    const closed = line({
      id: 'closed',
      hours_slots: [{ day: 2, open: '20:00', close: '22:00' }],
      timezone: 'Europe/Berlin',
    });
    const order = sortByAvailability([closed, unknown, openNow], tueBerlin1500).map((h) => h.id);
    expect(order).toEqual(['open', 'unknown', 'closed']);
  });
});

describe('channels', () => {
  it('folds the legacy scalar phone into the channel list', () => {
    expect(hotlineChannels(line({ phone: '116 123' }))).toEqual([
      { kind: 'phone', value: '116 123' },
    ]);
  });

  it('prepends the legacy phone when channels carry no phone of their own', () => {
    const h = line({ phone: '116 123', channels: [{ kind: 'chat', value: 'https://x.test' }] });
    expect(hotlineChannels(h).map((c) => c.kind)).toEqual(['phone', 'chat']);
  });

  it('does not duplicate the phone when channels already declare one', () => {
    const h = line({ phone: '116 123', channels: [{ kind: 'phone', value: '116 123' }] });
    expect(hotlineChannels(h)).toHaveLength(1);
  });

  it('returns an empty list for a directory with no phone', () => {
    expect(hotlineChannels(line({ phone: null }))).toEqual([]);
    expect(nonVoiceChannels(line({ phone: '1' }))).toEqual([]);
  });

  it('builds dialable hrefs per channel kind', () => {
    expect(channelHref({ kind: 'phone', value: '0800 111 0 111' })).toBe('tel:08001110111');
    expect(channelHref({ kind: 'sms', value: '988' })).toBe('sms:988');
    expect(channelHref({ kind: 'email', value: 'jo@x.test' })).toBe('mailto:jo@x.test');
    expect(channelHref({ kind: 'chat', value: 'https://x.test/chat' })).toBe('https://x.test/chat');
    expect(channelHref({ kind: 'whatsapp', value: '+41 79 000' })).toBe('https://wa.me/4179000');
    expect(channelHref({ kind: 'whatsapp', value: 'https://wa.me/x' })).toBe('https://wa.me/x');
  });
});

describe('isDirectory', () => {
  it('defaults an absent kind to hotline', () => {
    expect(isDirectory(line())).toBe(false);
    expect(isDirectory(line({ kind: 'directory' }))).toBe(true);
  });
});
