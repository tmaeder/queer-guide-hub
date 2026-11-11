/**
 * Is a failed GBFS fetch weather, or an outage?
 *
 * Lives in its own module because index.ts calls Deno.serve at load, so a test
 * importing it would start a server. Exported and tested rather than inlined: the
 * whole point of the branch is that ONE side must not count as an automation
 * failure, and a guard that cannot see which side fired could not tell this apart
 * from the defect it replaced (12 s timeout on a 9-22 s feed → ~50% of runs
 * reported error -> auto-pause after three in a row -> three days offline).
 *
 * Past the threshold a failure has persisted through ~12 attempts of a five-minute cron, so
 * it is an outage: the function goes 5xx and auto-pause can still fire. The bound
 * sits below check-pipeline-health's 120 min snapshot hard fail, so the automation
 * alarms first and the health check confirms rather than being the only witness.
 */
export const STALE_ESCALATE_MIN = 60;

/** A snapshot that could not be read arrives as Infinity and escalates — losing
 *  sight of the snapshot must not grant the upstream an indefinite pass. */
export function isTransientOutage(snapshotAgeMin: number): boolean {
  return snapshotAgeMin < STALE_ESCALATE_MIN;
}
