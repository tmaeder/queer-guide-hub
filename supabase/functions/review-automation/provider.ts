/** Operational provider failures stop the batch without turning cases into evidence blockers. */
export class ProviderError extends Error {
  constructor(provider: string, readonly status: number) {
    super(`${provider} HTTP ${status}`)
  }
}
