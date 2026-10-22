export const topics = ['newsletter', 'product_updates', 'events'] as const;
export const recipientKinds = ['organization', 'venue', 'vendor', 'user'] as const;
export const statuses = ['pending', 'subscribed', 'unsubscribed'] as const;
export const events = [
  'consent.confirmed',
  'consent.preferences_changed',
  'consent.unsubscribed',
  'delivery.delivered',
  'delivery.bounced',
  'delivery.complained',
] as const;
export type Rule =
  | { all: Rule[] }
  | { any: Rule[] }
  | { not: Rule }
  | {
      field: 'locale' | 'status' | 'source' | 'recipient_kind';
      op: 'eq' | 'in';
      value: string | string[];
    }
  | { field: 'topic'; op: 'contains'; value: string }
  | { field: 'created_at' | 'confirmed_at'; op: 'within_days' | 'older_than_days'; value: number }
  | { event: string; within_days: number; min_count: number };
export const defaultRule = (): Rule => ({ field: 'status', op: 'eq', value: 'subscribed' });
const integer = (v: unknown, max: number) =>
  typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= max;
// Client feedback only: the database remains the authoritative validator.
export function ruleError(rule: Rule): string | null {
  if (new TextEncoder().encode(JSON.stringify(rule)).length > 7000)
    return 'This rule is too large. Remove some conditions.';
  function check(r: Rule, depth: number): string | null {
    if (depth > 6) return 'Rules can have at most six nested levels.';
    if ('all' in r || 'any' in r) {
      const children = 'all' in r ? r.all : r.any;
      if (!children.length || children.length > 10)
        return 'Each group needs between one and ten conditions.';
      for (const child of children) {
        const error = check(child, depth + 1);
        if (error) return error;
      }
      return null;
    }
    if ('not' in r) return check(r.not, depth + 1);
    if ('event' in r)
      return events.includes(r.event as (typeof events)[number]) &&
        integer(r.within_days, 3650) &&
        integer(r.min_count, 1000)
        ? null
        : 'Use 1–3,650 days and 1–1,000 events.';
    if (r.field === 'created_at' || r.field === 'confirmed_at')
      return integer(r.value, 3650) ? null : 'Use a whole number of days between 1 and 3,650.';
    if (r.field === 'topic')
      return topics.includes(r.value as (typeof topics)[number])
        ? null
        : 'Choose a subscribed topic.';
    const values = Array.isArray(r.value) ? r.value : [r.value];
    if (!values.length || values.length > 20) return 'Use between one and twenty values.';
    if (
      values.some(
        (v) =>
          typeof v !== 'string' ||
          (r.field === 'locale'
            ? !/^[a-z]{2}(-[A-Za-z]{2,8})?$/.test(v)
            : r.field === 'status'
              ? !statuses.includes(v as (typeof statuses)[number])
              : r.field === 'recipient_kind'
                ? !recipientKinds.includes(v as (typeof recipientKinds)[number])
                : v.length < 1 || v.length > 100),
      )
    )
      return 'Check the condition values. Language codes use en or de-CH; choose a recipient type or use a source of 1–100 characters.';
    return null;
  }
  return check(rule, 0);
}
