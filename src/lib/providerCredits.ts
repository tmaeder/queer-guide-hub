/** Firecrawl account credits as manage-api-keys reports them. */
export interface ProviderCreditUsage {
  remainingCredits: number;
  planCredits: number | null;
  billingPeriodStart: string | null;
  billingPeriodEnd: string | null;
}

export function creditUsageLine(usage: ProviderCreditUsage | { error: string }): string {
  if ('error' in usage) return `Credits unavailable: ${usage.error}`;
  const n = (v: number) => v.toLocaleString('en-US');
  const credits =
    usage.planCredits === null
      ? `${n(usage.remainingCredits)} credits left`
      : `${n(usage.remainingCredits)} of ${n(usage.planCredits)} credits left`;
  if (!usage.billingPeriodEnd) return credits;
  const end = new Date(usage.billingPeriodEnd).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `${credits} · period ends ${end}`;
}
