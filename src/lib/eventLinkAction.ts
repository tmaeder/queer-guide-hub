/**
 * What the event's outbound link actually is, so the button says it.
 *
 * `ticket_url` is filled by importers with whatever link the source had: for
 * PiepShow it is a Resident Advisor PROMOTER page, for the Regenbogenhaus
 * library opening it is the organiser's own event page for ordinary opening
 * hours. Both rendered "Get tickets". The label now comes from the destination:
 * a known ticketing platform's event/checkout page books tickets, a known
 * registration tool registers, anything else is the official event details.
 */
export type EventLinkKind = 'tickets' | 'register' | 'details';

const TICKET_HOSTS = [
  'ticketmaster.',
  'eventim.',
  'dice.fm',
  'seetickets.',
  'ticketswap.',
  'shotgun.live',
  'tickettailor.com',
  'billetto.',
  'eventix.io',
  'universe.com',
  'tix.',
  'ticketcorner.ch',
  'starticket.ch',
  'petzi.ch',
  'eventfrog.',
  'xceed.me',
  'feverup.com',
  'ticketweb.',
  'axs.com',
  'skiddle.com',
  'pretix.eu',
  'tickets.',
];

const REGISTER_HOSTS = [
  'meetup.com',
  'lu.ma',
  'luma.com',
  'forms.gle',
  'typeform.com',
  'tally.so',
  'zoom.us',
  'jotform.com',
  'airtable.com',
];

function parse(url: string | null | undefined): URL | null {
  if (!url) return null;
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** `'eventim.'` = any host with an `eventim` label (eventim.de, eventim.ch); otherwise exact domain or subdomain. */
const matches = (host: string, list: string[]) => {
  const labels = host.split('.').slice(0, -1);
  return list.some((entry) =>
    entry.endsWith('.')
      ? labels.includes(entry.slice(0, -1))
      : host === entry || host.endsWith(`.${entry}`),
  );
};

export function eventLinkKind(
  url: string | null | undefined,
  opts: { isFree?: boolean | null } = {},
): EventLinkKind {
  const u = parse(url);
  if (!u) return 'details';
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const path = u.pathname.toLowerCase();

  // Resident Advisor carries promoter, club and artist pages beside events;
  // only an /events/ page sells a ticket.
  if (host === 'ra.co' || host.endsWith('.ra.co'))
    return path.includes('/events/') ? 'tickets' : 'details';
  if (host === 'docs.google.com') return path.includes('/forms/') ? 'register' : 'details';
  if (host === 'eventbrite.com' || host.includes('eventbrite.'))
    return path.includes('/e/') ? (opts.isFree ? 'register' : 'tickets') : 'details';
  if (matches(host, REGISTER_HOSTS)) return 'register';
  if (matches(host, TICKET_HOSTS)) return 'tickets';
  return 'details';
}
