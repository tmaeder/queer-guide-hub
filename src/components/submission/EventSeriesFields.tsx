/**
 * EventSeriesFields — recurrence + festival grouping for event submissions.
 *
 * Recurrence: lets a contributor express "every 1st Saturday", weekly-on-days, etc.,
 * captured as a canonical recurrence_rule (the shape expand_event_recurrence expands).
 * Festival: link the event to an existing festival/series or propose a new one.
 *
 * Writes into the generic submission form state via setFields (keys pass through the
 * passthrough() Zod schema into community_submissions.data).
 */

import { useMemo, useState } from 'react';
import { Repeat, CalendarRange, X } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useFestivalSearch, type FestivalHit } from '@/hooks/submission/useFestivalSearch';
import {
  describeRecurrence,
  WEEKDAY_CODES,
  WEEKDAY_LABELS,
  ORDINAL_OPTIONS,
  type CanonicalRecurrence,
} from '@/lib/recurrence';

type Mode = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly_date' | 'monthly_weekday';

interface EventSeriesFieldsProps {
  data: Record<string, unknown>;
  setFields: (fields: Record<string, unknown>) => void;
}

function ruleToMode(rule: CanonicalRecurrence | null): Mode {
  if (!rule) return 'none';
  if (rule.freq === 'DAILY') return 'daily';
  if (rule.freq === 'WEEKLY') return rule.interval === 2 ? 'biweekly' : 'weekly';
  return rule.bySetPos ? 'monthly_weekday' : 'monthly_date';
}

export function EventSeriesFields({ data, setFields }: EventSeriesFieldsProps) {
  const rule = (data.recurrence_rule as CanonicalRecurrence | null | undefined) ?? null;
  const mode = ruleToMode(rule);

  const applyRule = (next: CanonicalRecurrence | null) => {
    setFields({
      recurrence_rule: next,
      is_recurring: !!next,
      recurrence_pattern: describeRecurrence(next) ?? null,
    });
  };

  const onModeChange = (m: Mode) => {
    switch (m) {
      case 'none':
        return applyRule(null);
      case 'daily':
        return applyRule({ freq: 'DAILY', interval: 1, until: rule?.until });
      case 'weekly':
        return applyRule({ freq: 'WEEKLY', interval: 1, byDay: rule?.byDay ?? [], until: rule?.until });
      case 'biweekly':
        return applyRule({ freq: 'WEEKLY', interval: 2, byDay: rule?.byDay ?? [], until: rule?.until });
      case 'monthly_date':
        return applyRule({ freq: 'MONTHLY', interval: 1, until: rule?.until });
      case 'monthly_weekday':
        return applyRule({
          freq: 'MONTHLY',
          interval: 1,
          byDay: rule?.byDay?.length ? [rule.byDay[0]] : ['SA'],
          bySetPos: rule?.bySetPos ?? 1,
          until: rule?.until,
        });
    }
  };

  const toggleDay = (code: string) => {
    if (!rule) return;
    const current = rule.byDay ?? [];
    const next = current.includes(code)
      ? current.filter((d) => d !== code)
      : [...current, code];
    applyRule({ ...rule, byDay: WEEKDAY_CODES.filter((c) => next.includes(c)) });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ── Recurrence ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <Label className="flex items-center gap-1.5 text-sm font-semibold">
          <Repeat size={16} /> Repeats
        </Label>
        <Select value={mode} onValueChange={(v) => onModeChange(v as Mode)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Does not repeat</SelectItem>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekly">Weekly on…</SelectItem>
            <SelectItem value="biweekly">Every 2 weeks on…</SelectItem>
            <SelectItem value="monthly_weekday">Monthly on the Nth weekday</SelectItem>
            <SelectItem value="monthly_date">Monthly (same date)</SelectItem>
          </SelectContent>
        </Select>

        {/* Weekly / biweekly day picker */}
        {rule?.freq === 'WEEKLY' && (
          <div className="flex flex-wrap gap-2 mt-2">
            {WEEKDAY_CODES.map((code) => {
              const selected = rule.byDay?.includes(code);
              return (
                <Button
                  key={code}
                  type="button"
                  variant={selected ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => toggleDay(code)}
                >
                  {WEEKDAY_LABELS[code]}
                </Button>
              );
            })}
          </div>
        )}

        {/* Monthly-on-Nth-weekday picker */}
        {mode === 'monthly_weekday' && rule && (
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-sm text-muted-foreground">On the</span>
            <Select
              value={String(rule.bySetPos ?? 1)}
              onValueChange={(v) => applyRule({ ...rule, bySetPos: Number(v) })}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORDINAL_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={String(o.value)}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={rule.byDay?.[0] ?? 'SA'}
              onValueChange={(v) => applyRule({ ...rule, byDay: [v] })}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEEKDAY_CODES.map((code) => (
                  <SelectItem key={code} value={code}>
                    {WEEKDAY_LABELS[code]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* End date */}
        {rule && (
          <div className="flex flex-col gap-1 mt-2">
            <Label className="text-xs">Ends on (optional)</Label>
            <Input
              type="date"
              value={rule.until?.slice(0, 10) ?? ''}
              onChange={(e) =>
                applyRule({
                  ...rule,
                  until: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                })
              }
              className="max-w-48"
            />
          </div>
        )}

        {rule && (
          <p className="text-xs text-muted-foreground mt-1">{describeRecurrence(rule)}</p>
        )}
      </div>

      {/* ── Festival / series grouping ─────────────────────────── */}
      <FestivalPicker data={data} setFields={setFields} />
    </div>
  );
}

// ── Festival picker ──────────────────────────────────────────────

const FESTIVAL_TYPES = [
  { value: 'festival', label: 'Festival' },
  { value: 'pride', label: 'Pride' },
  { value: 'conference', label: 'Conference' },
  { value: 'series', label: 'Series' },
  { value: 'other', label: 'Other' },
];

function FestivalPicker({ data, setFields }: EventSeriesFieldsProps) {
  const festivalId = (data.festival_id as string | null) ?? null;
  const festivalName = (data.festival_name as string | undefined) ?? '';
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);

  const linked = useMemo(() => !!(festivalId && festivalName), [festivalId, festivalName]);

  const hits = useFestivalSearch(query, !linked && !creating);

  const selectExisting = (f: FestivalHit) => {
    setFields({ festival_id: f.id, festival_name: f.name, festival_type: f.festival_type ?? null });
    setQuery('');
  };

  const clearFestival = () => {
    setFields({ festival_id: null, festival_name: null, festival_type: null });
    setCreating(false);
    setQuery('');
  };

  return (
    <div className="flex flex-col gap-2">
      <Label className="flex items-center gap-1.5 text-sm font-semibold">
        <CalendarRange size={16} /> Part of a festival or series?
      </Label>
      <p className="text-xs text-muted-foreground">
        Group this event with others — e.g. a Pride week or a recurring party series.
      </p>

      {/* Linked state */}
      {linked && (
        <div className="flex items-center justify-between gap-2 rounded-element border border-border p-2">
          <span className="text-sm font-medium">{festivalName}</span>
          <Button type="button" variant="ghost" size="sm" onClick={clearFestival} className="gap-1">
            <X size={14} /> Remove
          </Button>
        </div>
      )}

      {/* Create-new state */}
      {!linked && creating && (
        <div className="flex flex-col gap-2">
          <Input
            placeholder="New festival / series name"
            value={festivalName}
            onChange={(e) => setFields({ festival_id: null, festival_name: e.target.value })}
          />
          <Select
            value={(data.festival_type as string) ?? 'series'}
            onValueChange={(v) => setFields({ festival_type: v })}
          >
            <SelectTrigger className="max-w-48">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              {FESTIVAL_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={clearFestival}
            className="text-xs text-muted-foreground underline self-start"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Search state */}
      {!linked && !creating && (
        <div className="flex flex-col gap-2">
          <Input
            placeholder="Search festivals…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {hits.length > 0 && (
            <ul className="m-0 p-0 list-none flex flex-col gap-1 rounded-element border border-border">
              {hits.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => selectExisting(f)}
                    className="w-full text-left px-2 py-2 text-sm hover:bg-muted"
                  >
                    {f.name}
                    {f.festival_type ? (
                      <span className="text-xs text-muted-foreground"> · {f.festival_type}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => {
              setCreating(true);
              setFields({ festival_id: null, festival_type: 'series' });
            }}
            className="text-xs text-foreground underline self-start"
          >
            + Create a new festival / series
          </button>
        </div>
      )}
    </div>
  );
}
