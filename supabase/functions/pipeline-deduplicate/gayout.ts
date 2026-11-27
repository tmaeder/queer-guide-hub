/** Query failure is not evidence that an entity is unique. Other providers
 * retain their existing policy; GayOut waits for successful duplicate checks. */
export function requireGayOutCandidateSearch(source: string | null | undefined,
  error: { message?: string } | null | undefined, circuitOpen: boolean | undefined, stage: string): void {
  if (source !== 'gayout') return
  if (error || circuitOpen) throw new Error(
    'GayOut duplicate ' + stage + ' search incomplete: ' + (error?.message || 'circuit open'))
}
