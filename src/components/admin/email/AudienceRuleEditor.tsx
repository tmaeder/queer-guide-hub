import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { defaultRule, events, statuses, topics, type Rule } from './audienceRules';
const selectClass =
  'min-h-10 w-full rounded-element border border-input bg-background px-4 text-sm';
const fields = ['status', 'locale', 'source', 'topic', 'created_at', 'confirmed_at'] as const;
const names: Record<string, string> = {
  status: 'Subscription status',
  locale: 'Language',
  source: 'Recorded subscription source',
  topic: 'Subscribed topic',
  created_at: 'Subscription age',
  confirmed_at: 'Confirmation age',
};
function fieldRule(field: (typeof fields)[number]): Rule {
  if (field === 'topic') return { field, op: 'contains', value: 'newsletter' };
  if (field === 'created_at' || field === 'confirmed_at')
    return { field, op: 'within_days', value: 30 };
  return {
    field,
    op: 'eq',
    value: field === 'status' ? 'subscribed' : field === 'locale' ? 'en' : '',
  };
}
export function AudienceRuleEditor({
  rule,
  onChange,
  depth = 0,
  label = 'Audience rule',
}: {
  rule: Rule;
  onChange: (rule: Rule) => void;
  depth?: number;
  label?: string;
}) {
  const id = useId();
  const kind =
    'all' in rule
      ? 'all'
      : 'any' in rule
        ? 'any'
        : 'not' in rule
          ? 'not'
          : 'event' in rule
            ? 'event'
            : 'condition';
  const children = 'all' in rule ? rule.all : 'any' in rule ? rule.any : null;
  return (
    <fieldset className="min-w-0 space-y-4 border-l-2 border-border pl-4 sm:pl-4">
      <legend className="text-sm font-medium">{label}</legend>
      <label className="block text-sm" htmlFor={id}>
        Match
      </label>
      <select
        id={id}
        className={selectClass}
        value={kind}
        onChange={(e) => {
          const v = e.target.value;
          onChange(
            v === 'all'
              ? { all: [defaultRule()] }
              : v === 'any'
                ? { any: [defaultRule()] }
                : v === 'not'
                  ? { not: defaultRule() }
                  : v === 'event'
                    ? { event: events[0], within_days: 30, min_count: 1 }
                    : defaultRule(),
          );
        }}
      >
        <option value="condition">A condition</option>
        <option value="event">A recorded event</option>
        <option value="all" disabled={depth >= 6}>
          All conditions
        </option>
        <option value="any" disabled={depth >= 6}>
          Any condition
        </option>
        <option value="not" disabled={depth >= 6}>
          None of this rule
        </option>
      </select>
      {children && (
        <>
          {children.map((child, i) => (
            <div key={i} className="space-y-2">
              <AudienceRuleEditor
                rule={child}
                depth={depth + 1}
                label={`Condition ${i + 1}`}
                onChange={(next) =>
                  onChange(
                    kind === 'all'
                      ? { all: children.map((r, j) => (j === i ? next : r)) }
                      : { any: children.map((r, j) => (j === i ? next : r)) },
                  )
                }
              />
              <Button
                type="button"
                variant="ghost"
                disabled={children.length === 1}
                aria-label={`Remove condition ${i + 1} from ${label}`}
                onClick={() =>
                  onChange(
                    kind === 'all'
                      ? { all: children.filter((_, j) => j !== i) }
                      : { any: children.filter((_, j) => j !== i) },
                  )
                }
              >
                Remove condition {i + 1}
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            aria-label={`Add condition to ${label.toLowerCase()}`}
            disabled={children.length >= 10}
            onClick={() =>
              onChange(
                kind === 'all'
                  ? { all: [...children, defaultRule()] }
                  : { any: [...children, defaultRule()] },
              )
            }
          >
            Add condition
          </Button>
        </>
      )}
      {'not' in rule && (
        <AudienceRuleEditor
          rule={rule.not}
          onChange={(not) => onChange({ not })}
          depth={depth + 1}
          label="Excluded rule"
        />
      )}
      {'event' in rule && (
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-sm">
            Event
            <select
              className={selectClass}
              value={rule.event}
              onChange={(e) => onChange({ ...rule, event: e.target.value })}
            >
              {events.map((e) => (
                <option key={e} value={e}>
                  {e.replace('.', ': ').replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm" htmlFor={`${id}-window`}>
            Within days
            <Input
              id={`${id}-window`}
              type="number"
              min={1}
              max={3650}
              value={Number.isNaN(rule.within_days) ? '' : rule.within_days}
              onChange={(e) => onChange({ ...rule, within_days: e.target.valueAsNumber })}
            />
          </label>
          <label className="text-sm" htmlFor={`${id}-count`}>
            Minimum events
            <Input
              id={`${id}-count`}
              type="number"
              min={1}
              max={1000}
              value={Number.isNaN(rule.min_count) ? '' : rule.min_count}
              onChange={(e) => onChange({ ...rule, min_count: e.target.valueAsNumber })}
            />
          </label>
        </div>
      )}
      {'field' in rule && (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            Contact field
            <select
              className={selectClass}
              value={rule.field}
              onChange={(e) => onChange(fieldRule(e.target.value as (typeof fields)[number]))}
            >
              {fields.map((f) => (
                <option key={f} value={f}>
                  {names[f]}
                </option>
              ))}
            </select>
          </label>
          {(rule.field === 'locale' || rule.field === 'source' || rule.field === 'status') && (
            <>
              <label className="text-sm">
                Comparison
                <select
                  className={selectClass}
                  value={rule.op}
                  onChange={(e) =>
                    onChange({
                      ...rule,
                      op: e.target.value as 'eq' | 'in',
                      value:
                        e.target.value === 'in'
                          ? [Array.isArray(rule.value) ? rule.value[0] : rule.value]
                          : Array.isArray(rule.value)
                            ? rule.value[0]
                            : rule.value,
                    })
                  }
                >
                  <option value="eq">Equals</option>
                  <option value="in">Is one of</option>
                </select>
              </label>
              {rule.field === 'status' && rule.op === 'eq' ? (
                <label className="text-sm">
                  Status
                  <select
                    className={selectClass}
                    value={rule.value as string}
                    onChange={(e) => onChange({ ...rule, value: e.target.value })}
                  >
                    {statuses.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="text-sm">
                  {rule.op === 'in' ? 'Values, separated by commas' : 'Value'}
                  <Input
                    value={Array.isArray(rule.value) ? rule.value.join(',') : rule.value}
                    maxLength={2100}
                    onChange={(e) =>
                      onChange({
                        ...rule,
                        value:
                          rule.op === 'in'
                            ? e.target.value.split(',').map((v) => v.trim())
                            : e.target.value,
                      })
                    }
                  />
                </label>
              )}
            </>
          )}
          {rule.field === 'topic' && (
            <label className="text-sm">
              Topic
              <select
                className={selectClass}
                value={rule.value}
                onChange={(e) => onChange({ ...rule, value: e.target.value })}
              >
                {topics.map((t) => (
                  <option key={t} value={t}>
                    {t.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            </label>
          )}
          {(rule.field === 'created_at' || rule.field === 'confirmed_at') && (
            <>
              <label className="text-sm">
                Age
                <select
                  className={selectClass}
                  value={rule.op}
                  onChange={(e) =>
                    onChange({ ...rule, op: e.target.value as 'within_days' | 'older_than_days' })
                  }
                >
                  <option value="within_days">Within the last</option>
                  <option value="older_than_days">Older than</option>
                </select>
              </label>
              <label className="text-sm" htmlFor={`${id}-days`}>
                Days
                <Input
                  id={`${id}-days`}
                  type="number"
                  min={1}
                  max={3650}
                  value={Number.isNaN(rule.value) ? '' : rule.value}
                  onChange={(e) => onChange({ ...rule, value: e.target.valueAsNumber })}
                />
              </label>
            </>
          )}
        </div>
      )}
    </fieldset>
  );
}
