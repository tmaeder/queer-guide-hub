export type JourneyNode =
  | { type: 'end' }
  | { type: 'welcome'; next: string }
  | { type: 'wait'; seconds: number; next: string }
  | { type: 'branch'; condition: 'profile_exists' | 'username_claimed'; yes: string; no: string };
export interface JourneyGraph {
  start: string;
  steps: Record<string, JourneyNode>;
}
export const journeyTriggers = [
  ['account.created', 'created', 'Account created'],
  ['profile.username.changed', 'claimed', 'Username claimed'],
  ['profile.username.changed', 'removed', 'Username removed'],
  ['event.rsvp.changed', 'going', 'RSVP: going'],
  ['event.rsvp.changed', 'interested', 'RSVP: interested'],
  ['group.membership.changed', 'joined', 'Group joined'],
  ['trip.membership.changed', 'invited', 'Trip invitation'],
  ['trip.membership.changed', 'accepted', 'Trip invitation accepted'],
] as const;
export function initialJourney(): JourneyGraph {
  return {
    start: 'welcome',
    steps: { welcome: { type: 'welcome', next: 'done' }, done: { type: 'end' } },
  };
}
export const nodeEdges = (node: JourneyNode): string[] =>
  node.type === 'end' ? [] : node.type === 'branch' ? [node.yes, node.no] : [node.next];
// Immediate editor feedback only; the database independently validates publication.
export function journeyGraphError(graph: JourneyGraph, event: string): string | null {
  const keys = Object.keys(graph.steps);
  if (!keys.length || keys.length > 32) return 'A journey needs between one and 32 steps.';
  if (new TextEncoder().encode(JSON.stringify(graph)).length > 16000)
    return 'This journey is too large.';
  if (!Object.hasOwn(graph.steps, graph.start)) return 'Choose a starting step.';
  const visited = new Set<string>(),
    active = new Set<string>();
  function check(id: string): string | null {
    if (!Object.hasOwn(graph.steps, id)) return 'Every connection needs an existing destination.';
    if (active.has(id)) return 'A journey cannot loop. Connect each path to an end step.';
    if (visited.has(id)) return null;
    const node = graph.steps[id];
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(id))
      return 'Step names must use lowercase letters, numbers and underscores.';
    if (!['end', 'welcome', 'wait', 'branch'].includes(node.type))
      return 'Choose a supported step type.';
    if (node.type === 'welcome' && event !== 'account.created')
      return 'Welcome messages require the account-created trigger.';
    if (
      node.type === 'wait' &&
      (!Number.isInteger(node.seconds) || node.seconds < 1 || node.seconds > 2592000)
    )
      return 'Waits need 1–2,592,000 whole seconds (up to 30 days).';
    if (node.type === 'branch' && !['profile_exists', 'username_claimed'].includes(node.condition))
      return 'Choose a supported profile condition.';
    active.add(id);
    for (const edge of nodeEdges(node)) {
      const error = check(edge);
      if (error) return error;
    }
    active.delete(id);
    visited.add(id);
    return null;
  }
  const error = check(graph.start);
  if (error) return error;
  if (visited.size !== keys.length)
    return 'Some steps are not connected to the start. Connect or remove them.';
  return null;
}
export function previewJourney(
  graph: JourneyGraph,
  profile: { profile_exists: boolean; username_claimed: boolean },
) {
  const trace: { id: string; kind: string; elapsed: number; outcome: string }[] = [];
  let id = graph.start,
    elapsed = 0;
  const visited = new Set<string>();
  while (Object.hasOwn(graph.steps, id) && !visited.has(id) && trace.length < 32) {
    visited.add(id);
    const node = graph.steps[id];
    const outcome =
      node.type === 'branch'
        ? profile[node.condition]
          ? 'yes'
          : 'no'
        : node.type === 'welcome'
          ? 'Would request the account welcome'
          : node.type === 'wait'
            ? `Wait ${node.seconds} seconds`
            : 'Complete';
    trace.push({ id, kind: node.type, elapsed, outcome });
    if (node.type === 'end') break;
    if (node.type === 'wait') elapsed += node.seconds;
    id = node.type === 'branch' ? (profile[node.condition] ? node.yes : node.no) : node.next;
  }
  return trace;
}
