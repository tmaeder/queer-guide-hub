jest.mock('@/lib/supabase', () => ({ supabase: {} }));

import { channelHref, channelsOf, hotlinesFor, type Hotline } from '../hotlines';

const base: Omit<Hotline, 'id' | 'country'> = {
  name: 'x',
  phone: null,
  topics: [],
  languages: [],
  hours: '',
  description: '',
};

const h = (id: string, country: string, extra: Partial<Hotline> = {}): Hotline => ({
  ...base,
  id,
  country,
  channels: [{ kind: 'phone', value: '+41 800 000 000' }],
  ...extra,
});

describe('hotlinesFor', () => {
  const all = [
    h('int', 'INT'),
    h('de', 'DE'),
    h('ch-day', 'CH'),
    h('ch-24', 'CH', { always_open: true }),
    h('ch-dir', 'CH', { kind: 'directory' }),
    h('ch-nochannel', 'CH', { channels: [] }),
  ];

  it('puts the country first, then international, and drops other countries', () => {
    expect(hotlinesFor(all, 'ch').map((x) => x.id)).toEqual(['ch-24', 'ch-day', 'int']);
  });

  it('never lists a directory or a line with no way to reach it', () => {
    const ids = hotlinesFor(all, 'CH').map((x) => x.id);
    expect(ids).not.toContain('ch-dir');
    expect(ids).not.toContain('ch-nochannel');
  });

  it('falls back to international lines when the region is unknown', () => {
    expect(hotlinesFor(all, null).map((x) => x.id)).toEqual(['int']);
  });
});

describe('channels', () => {
  it('folds the legacy phone field in once', () => {
    const line = h('a', 'CH', { phone: '0800', channels: [] });
    expect(channelsOf(line)).toEqual([{ kind: 'phone', value: '0800' }]);
    const both = h('b', 'CH', { phone: '0800' });
    expect(channelsOf(both)).toHaveLength(1);
  });

  it('builds dialable hrefs and refuses non-https chat links', () => {
    expect(channelHref({ kind: 'phone', value: '+41 (0)800 12-34' })).toBe('tel:+4108001234');
    expect(channelHref({ kind: 'sms', value: '741741' })).toBe('sms:741741');
    expect(channelHref({ kind: 'email', value: 'help@example.org' })).toBe('mailto:help@example.org');
    expect(channelHref({ kind: 'chat', value: 'http://insecure.example' })).toBeNull();
    expect(channelHref({ kind: 'chat', value: 'https://chat.example' })).toBe('https://chat.example');
  });
});
