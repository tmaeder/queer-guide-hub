const SITE_ORIGIN = 'https://queer.guide';

export interface ProgrammeLdChild {
  id: string;
  slug: string | null;
  title: string;
  start_date: string;
}

export interface ProgrammeLdUmbrella {
  id: string;
  slug: string | null;
  title: string;
}

/**
 * The `subEvent` / `superEvent` half of an event's JSON-LD.
 *
 * A festival and its day-parts published four competing indexable Event documents
 * with nothing declaring the relation between them, so a crawler had no way to tell
 * an umbrella from its own programme. schema.org has had both properties all along
 * and the data has existed since `parent_event_id` shipped.
 *
 * The crawler emits the same shape from `attachProgrammeLd()` in
 * `functions/_lib/detail.ts`. `functions/` and `src/` do not share a module graph, so
 * the two copies are kept in step by a drift test rather than by an import — the same
 * arrangement the boot guard uses.
 *
 * Returns `{}` rather than `{subEvent: []}` when there is nothing to say: an empty
 * array is a claim that a festival has no programme, which is different from not
 * having looked.
 */
export function programmeLd(
  selfId: string | undefined,
  umbrella: ProgrammeLdUmbrella | null | undefined,
  children: readonly ProgrammeLdChild[],
): Record<string, unknown> {
  if (!selfId || !umbrella) return {};

  // `event_programme()` resolves either side to the same root, so the id the page
  // was opened with is the only thing that says which end we are on.
  if (umbrella.id !== selfId) {
    return {
      superEvent: {
        '@type': 'Event',
        name: umbrella.title,
        url: `${SITE_ORIGIN}/events/${umbrella.slug}`,
      },
    };
  }

  const subs = children.filter((c) => c.id !== selfId && c.slug);
  if (subs.length === 0) return {};

  return {
    subEvent: subs.map((c) => ({
      '@type': 'Event',
      name: c.title,
      url: `${SITE_ORIGIN}/events/${c.slug}`,
      startDate: c.start_date,
    })),
  };
}
