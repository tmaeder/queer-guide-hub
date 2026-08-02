import { ArrowDownUp, ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { FieldConfig } from '@/types/cms';
import { sortableFields } from '../fieldCapabilities';
import type { SortSpec } from '../viewSpec';

/**
 * Ordered multi-sort. List order IS precedence, matching how PostgREST applies
 * successive `.order()` calls.
 *
 * Reordering is done with up/down buttons rather than drag: they are the
 * accessible path, they are what the tests drive, and they need no dependency.
 * Drag can be layered on later without changing this contract.
 */

interface Props {
  fields: FieldConfig[];
  sorts: SortSpec[];
  onChange: (sorts: SortSpec[]) => void;
}

/** Direction labels read differently per type — "A→Z" is wrong for a date. */
function directionLabels(field: FieldConfig | undefined): [string, string] {
  switch (field?.type) {
    case 'number':
      return ['1 → 9', '9 → 1'];
    case 'date':
    case 'datetime':
      return ['Oldest first', 'Newest first'];
    case 'boolean':
      return ['No → Yes', 'Yes → No'];
    default:
      return ['A → Z', 'Z → A'];
  }
}

/**
 * The row list, exported separately so it can be tested without driving a
 * Radix popover open in jsdom.
 */
export function SortRows({ fields, sorts, onChange }: Props) {
  const candidates = sortableFields(fields);
  const used = new Set(sorts.map((s) => s.field));
  const nextField = candidates.find((f) => !used.has(f.name));

  const move = (from: number, to: number) => {
    if (to < 0 || to >= sorts.length) return;
    const next = [...sorts];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  const addButton = (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 mt-2"
      disabled={!nextField}
      onClick={() => nextField && onChange([...sorts, { field: nextField.name, dir: 'asc' }])}
    >
      <Plus size={14} className="mr-1" />
      Add sort
    </Button>
  );

  if (sorts.length === 0) {
    return (
      <div>
        <p className="text-sm text-muted-foreground py-2">No sorts yet.</p>
        {addButton}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {sorts.map((s, i) => {
        const field = fields.find((f) => f.name === s.field);
        const [asc, desc] = directionLabels(field);
        const label = field?.label ?? s.field;
        return (
          <div key={s.field} className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-4 shrink-0">{i + 1}</span>

            <Select
              value={s.field}
              onValueChange={(name) =>
                onChange(sorts.map((x, xi) => (xi === i ? { ...x, field: name } : x)))
              }
            >
              <SelectTrigger className="h-8 w-[170px] shrink-0" aria-label="Sort field">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((f) => (
                  <SelectItem
                    key={f.name}
                    value={f.name}
                    disabled={f.name !== s.field && used.has(f.name)}
                  >
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={s.dir}
              onValueChange={(dir) =>
                onChange(
                  sorts.map((x, xi) => (xi === i ? { ...x, dir: dir as 'asc' | 'desc' } : x)),
                )
              }
            >
              <SelectTrigger className="h-8 flex-1 min-w-0" aria-label="Sort direction">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">{asc}</SelectItem>
                <SelectItem value="desc">{desc}</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 shrink-0"
              aria-label={`Move ${label} up`}
              disabled={i === 0}
              onClick={() => move(i, i - 1)}
            >
              <ChevronUp size={14} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 shrink-0"
              aria-label={`Move ${label} down`}
              disabled={i === sorts.length - 1}
              onClick={() => move(i, i + 1)}
            >
              <ChevronDown size={14} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 shrink-0"
              aria-label={`Remove sort: ${label}`}
              onClick={() => onChange(sorts.filter((_, xi) => xi !== i))}
            >
              <X size={14} />
            </Button>
          </div>
        );
      })}
      {addButton}
    </div>
  );
}

export function SortBuilder({ fields, sorts, onChange }: Props) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-8">
          <ArrowDownUp size={14} className="mr-1" />
          Sort
          {sorts.length > 0 && (
            <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-xs2">
              {sorts.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[460px] p-4" align="start">
        <h6 className="text-2xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">
          Sort
        </h6>
        <SortRows fields={fields} sorts={sorts} onChange={onChange} />
      </PopoverContent>
    </Popover>
  );
}
