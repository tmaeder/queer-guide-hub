/** Exact-recipient rules only: never edit a catch-all or another destination. */
export const INBOX_DOMAIN = 'inbox.queer.guide'
export const INBOX_WORKER = 'queer-guide-worker-trip-inbox'
export interface RoutingRule {
  id?: string
  tag?: string
  enabled?: boolean
  matchers?: { type: string; field?: string; value?: string }[]
  actions?: { type: string; value?: string[] }[]
}
export class RoutingError extends Error {}
export function inboxAddress(shortId: string): string {
  if (!/^[a-z0-9]{6,32}$/.test(shortId)) throw new RoutingError('Invalid inbox identifier')
  return `trip-${shortId}@${INBOX_DOMAIN}`
}
export function targetsAddress(rule: RoutingRule, address: string): boolean {
  return rule.matchers?.length === 1 && rule.matchers[0].type === 'literal' &&
    rule.matchers[0].field === 'to' && rule.matchers[0].value?.toLowerCase() === address
}
export function targetsWorker(rule: RoutingRule): boolean {
  return rule.actions?.length === 1 && rule.actions[0].type === 'worker' &&
    rule.actions[0].value?.length === 1 && rule.actions[0].value[0] === INBOX_WORKER
}
export class InboxRouting {
  private base: string
  constructor(private token: string, zoneId: string, private send: typeof fetch = fetch) {
    if (!token || !/^[a-f0-9]{32}$/.test(zoneId)) throw new RoutingError('Email routing is not configured')
    this.base = `https://api.cloudflare.com/client/v4/zones/${zoneId}/email/routing/rules`
  }
  private async request(path: string, method = 'GET', body?: unknown) {
    const response = await this.send(this.base + path, {
      method,
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    })
    const data = await response.json().catch(() => null)
    if (!response.ok || !data?.success) {
      // Do not expose provider responses, headers, tokens, or unrelated recipients.
      throw new RoutingError(`Email routing provider request failed (${response.status})`)
    }
    return data
  }
  async list(): Promise<RoutingRule[]> {
    const rules: RoutingRule[] = []
    for (let page = 1; page <= 100; page++) {
      const data = await this.request(`?page=${page}&per_page=50`)
      if (!Array.isArray(data.result)) throw new RoutingError('Invalid email routing response')
      rules.push(...data.result)
      if (data.result.length < 50 || page >= (data.result_info?.total_pages ?? Infinity)) return rules
    }
    throw new RoutingError('Email routing pagination limit reached')
  }
  async ensure(shortId: string): Promise<string> {
    const address = inboxAddress(shortId)
    const rules = (await this.list()).filter(rule => targetsAddress(rule, address))
    if (rules.some(rule => !targetsWorker(rule))) throw new RoutingError('Inbox address has a conflicting routing rule')
    const existing = rules.find(rule => rule.enabled)
    if (existing) return this.id(existing)
    const body = {
      name: `Trip inbox ${shortId}`,
      enabled: true,
      matchers: [{ type: 'literal', field: 'to', value: address }],
      actions: [{ type: 'worker', value: [INBOX_WORKER] }],
    }
    if (rules.length) {
      const updated = await this.request(`/${this.id(rules[0])}`, 'PUT', body)
      return this.id(updated.result)
    }
    try {
      return this.id((await this.request('', 'POST', body)).result)
    } catch (error) {
      // Concurrent requests can race to create the same exact address. Recover
      // only if the provider now confirms the intended enabled Worker rule.
      const confirmed = (await this.list()).filter(rule => targetsAddress(rule, address))
      if (confirmed.length && confirmed.every(targetsWorker) && confirmed.some(rule => rule.enabled)) {
        return this.id(confirmed.find(rule => rule.enabled)!)
      }
      throw error
    }
  }
  async remove(shortId: string): Promise<void> {
    const address = inboxAddress(shortId)
    for (const rule of await this.list()) {
      if (targetsAddress(rule, address) && targetsWorker(rule)) {
        await this.request(`/${this.id(rule)}`, 'DELETE')
      }
    }
  }
  private id(rule: RoutingRule): string {
    const id = rule?.id || rule?.tag
    if (!id || !/^[a-f0-9-]+$/i.test(id)) throw new RoutingError('Invalid email routing rule identifier')
    return id
  }
}
