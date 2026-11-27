import { isUuid } from '@/lib/uuid';

/** Only explicit discovery context is carried between Meet routes. */
export interface PeopleContext {
  city?: string;
  cityId?: string;
  eventId?: string;
  tripId?: string;
  start?: string;
  end?: string;
  activity?: string;
}

const CONTEXT_KEYS = ['city', 'cityId', 'eventId', 'tripId', 'start', 'end', 'activity'] as const;

export function readPeopleContext(params: URLSearchParams): PeopleContext {
  const context: PeopleContext = Object.fromEntries(
    CONTEXT_KEYS.flatMap((key) => {
      const value = params.get(key)?.trim();
      return value ? [[key, value]] : [];
    }),
  );
  // Older live-map dating links use ?city=<uuid>; public browsing uses a slug.
  if (isUuid(context.city ?? '')) {
    context.cityId ??= context.city;
    delete context.city;
  }
  return context;
}

export function peopleContextHref(href: string, context: PeopleContext): string {
  const [path, query = ''] = href.split('?');
  const params = new URLSearchParams(query);
  for (const key of CONTEXT_KEYS) {
    if (context[key] && !params.has(key)) params.set(key, context[key]);
  }
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}
