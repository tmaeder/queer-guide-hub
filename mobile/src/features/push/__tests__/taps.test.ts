import { notificationTarget } from '../taps';

describe('notificationTarget', () => {
  it('opens app screens in the app', () => {
    expect(notificationTarget('/venues/mylord')).toEqual({ kind: 'app', path: '/venues/mylord' });
    expect(notificationTarget('/help')).toEqual({ kind: 'app', path: '/help' });
  });
  it('opens other site paths on queer.guide', () => {
    expect(notificationTarget('/messages?conversation=abc')).toEqual({
      kind: 'web',
      url: 'https://queer.guide/messages?conversation=abc',
    });
    expect(notificationTarget('/venues/mylord/reviews')).toEqual({
      kind: 'web',
      url: 'https://queer.guide/venues/mylord/reviews',
    });
  });
  it('ignores anything that is not a site path', () => {
    for (const v of [
      undefined,
      42,
      '',
      'https://evil.example',
      '//evil.example/x',
      'javascript:alert(1)',
    ])
      expect(notificationTarget(v)).toBeNull();
  });
});
