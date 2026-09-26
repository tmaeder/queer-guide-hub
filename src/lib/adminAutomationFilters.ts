export type AutomationView = 'active' | 'attention' | 'paused' | 'all';

export interface FilterableAutomation {
  slug: string;
  name: string;
  description: string | null;
  managed_by: 'user' | 'system';
  enabled: boolean;
  last_run_status: string | null;
  consecutive_failures: number;
  consecutive_partials?: number;
  lifecycle_state?: 'active' | 'paused' | 'auto_paused' | 'completed' | 'retired' | 'consolidated';
}

const RETIRED_MARKER = /^\[(?:RETIRED|COMPLETED|CONSOLIDATED)\b/i;

const DOMAIN_PREFIXES: Array<[string, string]> = [
  ['marketplace_', 'Marketplace'],
  ['milestone_', 'Milestones'],
  ['event_', 'Events'],
  ['venue_', 'Venues'],
  ['city_', 'Cities'],
  ['news_', 'News'],
  ['personality_', 'People'],
  ['profession_', 'People'],
  ['hotel_', 'Hotels'],
  ['push_', 'Notifications'],
  ['workflow_', 'Workflows'],
  ['wf_', 'Workflows'],
  ['tag_', 'Taxonomy'],
];

export function automationDomain(slug: string): string {
  return DOMAIN_PREFIXES.find(([prefix]) => slug.startsWith(prefix))?.[1] ?? 'Shared';
}

export function isRetiredAutomation(automation: FilterableAutomation): boolean {
  return (
    automation.lifecycle_state === 'completed' ||
    automation.lifecycle_state === 'retired' ||
    automation.lifecycle_state === 'consolidated' ||
    RETIRED_MARKER.test(automation.description?.trim() ?? '')
  );
}

export function needsAutomationAttention(automation: FilterableAutomation): boolean {
  return (
    automation.lifecycle_state === 'auto_paused' ||
    automation.last_run_status === 'auto_paused' ||
    (automation.enabled && automation.last_run_status === 'partial') ||
    (automation.enabled && automation.consecutive_failures > 0)
  );
}

export function automationStatusLabel(automation: FilterableAutomation): string {
  if (automation.enabled) {
    if (automation.consecutive_failures > 0) {
      const noun = automation.consecutive_failures === 1 ? 'error' : 'errors';
      return `Attention · ${automation.consecutive_failures} ${noun}`;
    }
    if (automation.last_run_status === 'partial') {
      const count = Math.max(automation.consecutive_partials ?? 1, 1);
      return count === 1 ? 'Attention · partial' : `Attention · ${count} partials`;
    }
    return 'Healthy';
  }
  if (
    automation.lifecycle_state === 'auto_paused' ||
    automation.last_run_status === 'auto_paused'
  ) {
    return `Auto-paused · ${automation.consecutive_failures} errors`;
  }
  return automation.lifecycle_state?.replace('_', ' ') ?? 'paused';
}

export function filterAutomations<T extends FilterableAutomation>(
  automations: T[],
  options: { view: AutomationView; query: string; domain: string; owner: string },
): T[] {
  const query = options.query.trim().toLocaleLowerCase();
  return automations.filter((automation) => {
    const retired = isRetiredAutomation(automation);
    const attention = needsAutomationAttention(automation);
    const matchesView =
      options.view === 'all' ||
      (options.view === 'active' && automation.enabled && !retired) ||
      (options.view === 'attention' && attention && !retired) ||
      (options.view === 'paused' && !automation.enabled && !retired);
    if (!matchesView) return false;
    if (options.domain !== 'all' && automationDomain(automation.slug) !== options.domain)
      return false;
    if (options.owner !== 'all' && automation.managed_by !== options.owner) return false;
    if (!query) return true;
    return [
      automation.name,
      automation.slug,
      automation.description ?? '',
      automationDomain(automation.slug),
    ].some((value) => value.toLocaleLowerCase().includes(query));
  });
}

export function automationCounts(automations: FilterableAutomation[]) {
  return {
    active: automations.filter((a) => a.enabled && !isRetiredAutomation(a)).length,
    attention: automations.filter((a) => needsAutomationAttention(a) && !isRetiredAutomation(a))
      .length,
    paused: automations.filter((a) => !a.enabled && !isRetiredAutomation(a)).length,
    autoPaused: automations.filter(
      (a) => a.lifecycle_state === 'auto_paused' || a.last_run_status === 'auto_paused',
    ).length,
    terminal: automations.filter(isRetiredAutomation).length,
    total: automations.length,
  };
}
