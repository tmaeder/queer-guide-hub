/**
 * Admin archetype registry — the artifact that makes the thesis auditable.
 *
 * `Admin Archetypes.dc.html` argues: *"Admin is not forty designs. It is one
 * shell and eight content archetypes, each with a fixed header grammar: route
 * line, title, filter row, primary action. Every admin route below resolves to
 * one of them."*
 *
 * That claim is only worth anything if it can be checked, so it lives here as
 * data rather than as prose. `adminArchetypes.test.ts` asserts that every
 * element-bearing route in `src/routes.tsx` appears exactly once
 * below, and that anything not resolving to a frame carries an explicit
 * `exempt` with a written reason. A new admin route fails the build until
 * somebody decides which frame it is.
 *
 * The honest score today is **24 of 40 clean, 11 with a stated caveat, 5
 * exemptions with reasons** — recorded rather than rounded up, because a
 * registry that quietly rounds "nearly" to "yes" is worth less than no
 * registry. All 40 routes ARE accounted for; "caveated" means the frame fits
 * but the route carries something extra the frame does not describe.
 *
 * This file is deliberately inert: registering a route changes nothing on its
 * own. `AdminShell` reads it to decide whether a page still needs the legacy
 * breadcrumb + area-hint band, so migration is one route at a time and the app
 * is shippable at every commit.
 */

/** The eight content archetypes, verbatim from the design document. */
export const ARCHETYPES = {
  A: { name: 'Index', brief: 'Filterable table of records with bulk actions and saved views.' },
  B: { name: 'Record editor', brief: 'Field form, left tab rail, quality panel docked right.' },
  C: { name: 'Compare', brief: 'Two records side by side, conflicts marked, one merge action.' },
  D: { name: 'Ops monitor', brief: 'Stage line, run history, live log. Read-mostly.' },
  E: {
    name: 'Analytics board',
    brief: 'Line chart drawn as track, plus one ranked list that implies an action.',
  },
  F: { name: 'Inbox', brief: 'List, thread, action rail. Every item ends in a decision.' },
  G: {
    name: 'Tree + canvas',
    brief: 'Hierarchy on the left, spatial or graph view on the right.',
  },
  H: { name: 'Registry', brief: 'Named rules or tokens with a state toggle and a fired-count.' },
} as const;

export type ArchetypeKey = keyof typeof ARCHETYPES;

export type AdminArchetypeEntry = {
  /** Route path relative to /admin, matching the router in src/routes.tsx. */
  path: string;
  /** The frame this route renders in. `null` only alongside an `exempt`. */
  archetype: ArchetypeKey | null;
  /** Header title. Falls back to the nav label when omitted. */
  title?: string;
  /**
   * Frames this route ALSO hosts behind its own tabs. Recorded so a route that
   * is genuinely more than one thing says so, instead of being filed under its
   * loudest tab and quietly making the eight-frame claim false.
   */
  subFrames?: ArchetypeKey[];
  /** Why this route has no frame. Required whenever `archetype` is null. */
  exempt?: string;
  /** Why this assignment is imperfect. Does not exempt it from having a frame. */
  caveat?: string;
  /**
   * The page actually renders `AdminArchetypeHeader` today.
   *
   * Assignment and adoption are SEPARATE on purpose. The registry can describe
   * all forty routes immediately — that is what makes the thesis auditable —
   * while the shell only retires a route's legacy breadcrumb + area-hint band
   * once that route emits its own header. Conflating the two would hide the
   * breadcrumbs on 35 unmigrated pages the moment the registry landed, which
   * is precisely the big-bang this design exists to avoid.
   *
   * Flip one flag per migration PR.
   */
  adopted?: true;
};

export const ADMIN_ARCHETYPES: AdminArchetypeEntry[] = [
  // ── Not archetypes ────────────────────────────────────────────────────
  {
    path: '(index)',
    archetype: null,
    exempt:
      'This is the SHELL, not a page in it. `Admin Templates.dc.html` draws the cockpit as the ' +
      'frame itself — ink rail, topbar greeting, 4-up stat row, panels — and the eight archetypes ' +
      'are what sit inside that frame. Forcing it into E would invent a chart it has no data for.',
  },
  {
    path: 'design',
    archetype: null,
    exempt:
      'It edits the tokens every frame renders with. A broken frame would make the tool that ' +
      'fixes it unusable, so this route stays outside the system on purpose. It also sits under ' +
      'the one eslint block that re-states the admin rules WITHOUT the colour selector (the ' +
      'branding editor legitimately holds neutral hex defaults), so a frame placed here would ' +
      'silently lose that guard. Adopts AdminArchetypeHeader only.',
  },
  {
    path: '*',
    archetype: null,
    exempt: 'The admin 404 is shell chrome, not content. Restyled in place.',
  },
  {
    path: 'review',
    archetype: null,
    exempt:
      'ReviewRedirect renders no UI — it resolves the legacy /admin/review entry point and ' +
      'navigates. An element-bearing redirect is still a redirect.',
  },
  {
    path: 'imports/data',
    archetype: null,
    exempt:
      'RETIRE rather than reframe. AdminImports is a launcher grid of eight import widgets with ' +
      'no data of its own; each tool belongs in its entity index as the primary action, which is ' +
      'exactly what the fixed header grammar reserves that slot for. TRAP: removing its nav row ' +
      'also removes the Data section FIRST item, which getBreadcrumbsForRoute links the section ' +
      'crumb to — and the next item, `pipelines`, is adminOnly, so the Data breadcrumb would 403 ' +
      'for editors. Promote email-ingestions first.',
  },

  // ── A · Index (the archetype the claim lives or dies on) ───────────────
  { path: 'content', archetype: 'A', title: 'Content' },
  { path: 'content/:type', archetype: 'A' },
  { path: 'content/personalities', archetype: 'A', title: 'Personalities' },
  { path: 'content/milestones', archetype: 'A', title: 'Milestones' },
  { path: 'users', archetype: 'A', title: 'Users' },
  { path: 'business', archetype: 'A', title: 'Business' },
  { path: 'audit', archetype: 'A', title: 'Audit log' },
  { path: 'imports/email-ingestions', archetype: 'A', title: 'Email ingestions' },
  {
    path: 'media',
    archetype: 'A',
    title: 'Media',
    caveat: 'Index frame with a GRID view rather than a table — see the note on A below.',
  },
  {
    path: 'settings',
    archetype: 'A',
    title: 'Vocabularies',
    caveat:
      'An A table with seven quality panels bolted on. The panels belong on /admin/quality or ' +
      'behind an F drawer; until they move this route is A-plus-extras.',
  },

  // ── B · Record editor ─────────────────────────────────────────────────
  { path: 'business/:id', archetype: 'B' },
  { path: 'media/:id', archetype: 'B' },
  {
    path: 'content/personalities/:id/datasheet',
    archetype: 'B',
    caveat: 'Read-mostly: no quality panel in the right rail, so the third column is optional.',
  },

  // ── C · Compare ───────────────────────────────────────────────────────
  {
    path: 'duplicates',
    archetype: 'C',
    title: 'Duplicates',
    caveat:
      'The only C ROUTE, but there are seven more hand-rolled diff layouts embedded elsewhere ' +
      '(import-hub SideBySideComparison / DuplicatePairCard / MergeDialog, triage FieldDiffView, ' +
      'VocabMerge, design PublishDiffDialog, pipeline PipelineDiffDialog + RunCompareDialog). ' +
      'Collapsing those onto this frame is the single largest dedup win in the programme.',
  },

  // ── D · Ops monitor ───────────────────────────────────────────────────
  { path: 'cloudflare', archetype: 'D', title: 'Cloudflare' },
  { path: 'security', archetype: 'D', title: 'Security' },
  {
    path: 'pipelines',
    archetype: 'D',
    title: 'Pipelines',
    subFrames: ['G', 'A', 'E'],
    caveat:
      'ONE route, FOUR archetypes: 13 tabs spanning the monitor (D), the builder canvas (G), the ' +
      'sources/staging tables (A) and the coverage charts (E). Registered with subFrames rather ' +
      'than filed under D alone, because pretending it resolves to one frame is precisely the ' +
      'kind of rounding that would make the eight-frame claim a lie. Splitting it on ?tab= is ' +
      'possible later; useTabParam already segments it.',
  },

  // ── E · Analytics board ───────────────────────────────────────────────
  { path: 'analytics', archetype: 'E', title: 'Analytics' },
  { path: 'affiliate', archetype: 'E', title: 'Affiliate' },
  {
    path: 'content/event-quality',
    archetype: 'E',
    title: 'Event quality',
    caveat: 'A single panel with no ranked list — an E fragment rather than a full board.',
  },
  {
    path: 'search-intelligence',
    archetype: 'E',
    title: 'Search intelligence',
    caveat:
      'Only its Analytics and IngestionQuality tabs are E. Synonyms/Suggestions are H and Setup ' +
      'is a plain form.',
  },

  // ── F · Inbox ─────────────────────────────────────────────────────────
  { path: 'inbox', archetype: 'F', title: 'Inbox' },
  { path: 'postfach', archetype: 'F', title: 'Mailbox' },
  { path: 'content/group-requests', archetype: 'F', title: 'Group requests' },
  { path: 'content/twenty-crm', archetype: 'F', title: 'CRM' },
  { path: 'content/liveness', archetype: 'F', title: 'Liveness' },
  { path: 'places-editorial', archetype: 'F', title: 'Places editorial' },
  {
    path: 'feedback',
    archetype: 'F',
    title: 'Feedback',
    caveat: 'Queue tab is F; the Kanban and Roadmap tabs are A with a board view.',
  },

  // ── G · Tree + canvas ─────────────────────────────────────────────────
  { path: 'geography', archetype: 'G', title: 'Geography' },
  { path: 'graph', archetype: 'G', title: 'Content graph' },
  {
    path: 'maps',
    archetype: 'G',
    title: 'Maps',
    caveat:
      'Full-bleed MapShell with no tree today; the layer/filter panel is promoted into the 320px ' +
      'column. MapShell itself must NOT be modified — it is shared with the public /map.',
  },

  // ── H · Registry ──────────────────────────────────────────────────────
  { path: 'automation', archetype: 'H', title: 'Automations', adopted: true },
  { path: 'recognition', archetype: 'H', title: 'Recognition' },
  {
    path: 'email-templates',
    archetype: 'H',
    title: 'Email templates',
    caveat: 'H registry plus a rich editor; the editor half is really B.',
  },
  {
    path: 'quality',
    archetype: 'H',
    title: 'Quality',
    caveat:
      'Genuinely ambiguous E vs H. Filed as H: QUALITY_GATES are named rules, the pending count ' +
      'is the fired-count, and the link-to-queue takes the toggle slot. E would demand a chart ' +
      'this page has no data for.',
  },
];

const BY_PATH = new Map(ADMIN_ARCHETYPES.map((e) => [e.path, e]));

/** Registry entry for a route path relative to /admin, or undefined. */
export function getArchetypeEntry(path: string): AdminArchetypeEntry | undefined {
  return BY_PATH.get(path);
}

/** Registry entry for a live pathname, following dynamic segments. */
function entryForRoute(pathname: string): AdminArchetypeEntry | undefined {
  const rest = pathname.replace(/^\/admin\/?/, '').replace(/\/$/, '');
  return BY_PATH.get(rest === '' ? '(index)' : rest) ?? matchDynamic(rest);
}

/**
 * The frame a live pathname renders in, or null when the route is exempt or
 * unregistered. This is the ASSIGNMENT — it says nothing about whether the
 * page has been migrated yet.
 */
export function getArchetypeForRoute(pathname: string): ArchetypeKey | null {
  return entryForRoute(pathname)?.archetype ?? null;
}

/**
 * Whether this route emits `AdminArchetypeHeader` today.
 *
 * `AdminShell` calls this during render to decide whether to keep the legacy
 * breadcrumb + area-hint band. Deliberately a PURE function of the pathname
 * rather than a context flag written from a child's effect:
 * `react-hooks/set-state-in-effect` is an ERROR across the admin tree, and a
 * render-phase read has no ordering hazard.
 */
export function hasAdoptedFrame(pathname: string): boolean {
  return entryForRoute(pathname)?.adopted === true;
}

/** Registered routes carrying a param segment, matched positionally. */
function matchDynamic(rest: string): AdminArchetypeEntry | undefined {
  const parts = rest.split('/');
  for (const entry of ADMIN_ARCHETYPES) {
    if (!entry.path.includes(':')) continue;
    const pattern = entry.path.split('/');
    if (pattern.length !== parts.length) continue;
    if (pattern.every((seg, i) => seg.startsWith(':') || seg === parts[i])) return entry;
  }
  return undefined;
}

/** `B · RECORD EDITOR — /admin/content/venue/schwuz`, the header's route line. */
export function getArchetypeRouteLine(pathname: string): string | null {
  const key = getArchetypeForRoute(pathname);
  if (!key) return null;
  return `${key} · ${ARCHETYPES[key].name.toUpperCase()} — ${pathname}`;
}
