import { describe, expect, it } from 'vitest';
import { eventLinkKind } from '../eventLinkAction';

describe('eventLinkKind', () => {
  it('a Resident Advisor PROMOTER page is not a ticket (PiepShow)', () => {
    expect(eventLinkKind('https://de.ra.co/promoters/2276960')).toBe('details');
  });
  it('a Resident Advisor event page sells tickets', () => {
    expect(eventLinkKind('https://ra.co/events/2000000')).toBe('tickets');
  });
  it("an organiser's own page for opening hours is official details (Regenbogenhaus)", () => {
    expect(
      eventLinkKind(
        'https://haz.ch/event/regenbogenhaus-bibliothek-geoeffnet-regenbogenhaus-library-open-47/',
      ),
    ).toBe('details');
  });
  it('known ticket platforms book tickets', () => {
    for (const url of [
      'https://www.ticketmaster.de/event/123',
      'https://www.eventim.ch/event/x',
      'https://dice.fm/event/abc',
      'https://www.petzi.ch/de/events/1/',
      'https://eventfrog.ch/de/p/x.html',
      'https://tickets.example.org/buy',
    ]) {
      expect(eventLinkKind(url), url).toBe('tickets');
    }
  });
  it('registration tools register', () => {
    expect(eventLinkKind('https://www.meetup.com/group/events/1/')).toBe('register');
    expect(eventLinkKind('https://lu.ma/abc')).toBe('register');
    expect(eventLinkKind('https://docs.google.com/forms/d/e/x/viewform')).toBe('register');
  });
  it('eventbrite: free event page registers, paid books tickets, other pages are details', () => {
    expect(eventLinkKind('https://www.eventbrite.de/e/x-123', { isFree: true })).toBe('register');
    expect(eventLinkKind('https://www.eventbrite.com/e/x-123')).toBe('tickets');
    expect(eventLinkKind('https://www.eventbrite.com/o/some-organiser')).toBe('details');
  });
  it('label matching does not fire on substrings (matrix.org is not "tix")', () => {
    expect(eventLinkKind('https://matrix.org/event')).toBe('details');
    expect(eventLinkKind('https://mytickets-blog.com/x')).toBe('details');
  });
  it('missing or malformed links are details, never tickets', () => {
    expect(eventLinkKind(null)).toBe('details');
    expect(eventLinkKind('not a url')).toBe('details');
  });
});
