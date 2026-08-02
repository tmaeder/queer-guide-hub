import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import type { FieldConfig } from '@/types/cms';
import { displayableFields } from '../fieldCapabilities';

/**
 * Choose which fields a view shows, and in what order.
 *
 * The visible list IS the order — there is no separate ordering array that
 * could drift from it. Reordering uses up/down buttons: they are keyboard
 * reachable, announce themselves, and need no drag dependency.
 *
 * A search box is not optional here. `countries` declares ~55 fields, and an
 * unfiltered list of 55 switches is unusable.
 */

interface Props {
  fields: FieldConfig[];
  /** Ordered list of visible field names. */
  columns: string[];
  onChange: (columns: string[]) => void;
}

export function PropertyManager({ fields, columns, onChange }: Props) {
  const [query, setQuery] = useState('');

  const available = displayableFields(fields);
  const byName = new Map(available.map((f) => [f.name, f]));
  const shown = columns.filter((n) => byName.has(n));
  const hidden = available.filter((f) => !shown.includes(f.name)).map((f) => f.name);

  const matches = (name: string) => {
    if (!query.trim()) return true;
    const f = byName.get(name);
    return (f?.label ?? name).toLowerCase().includes(query.trim().toLowerCase());
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= shown.length) return;
    const next = [...shown];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  const label = (name: string) => byName.get(name)?.label ?? name;

  return (
    <div>
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Find a property"
        aria-label="Find a property"
        className="h-8 mb-2"
      />

      <div className="flex items-center justify-between mb-1">
        <h6 className="text-2xs uppercase tracking-wide text-muted-foreground font-semibold">
          Shown
        </h6>
        <Button
          variant="ghost"
          size="sm"
          className="h-7"
          onClick={() => onChange([])}
          disabled={shown.length === 0}
        >
          Hide all
        </Button>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground py-1">No properties shown.</p>
      ) : (
        <ul className="flex flex-col">
          {shown.map((name, i) =>
            matches(name) ? (
              <li key={name} className="flex items-center gap-2 py-1">
                <Switch
                  checked
                  aria-label={`Hide ${label(name)}`}
                  onCheckedChange={() => onChange(shown.filter((n) => n !== name))}
                />
                <span className="text-sm flex-1 min-w-0 truncate">{label(name)}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  aria-label={`Move ${label(name)} up`}
                  disabled={i === 0}
                  onClick={() => move(i, i - 1)}
                >
                  <ChevronUp size={14} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  aria-label={`Move ${label(name)} down`}
                  disabled={i === shown.length - 1}
                  onClick={() => move(i, i + 1)}
                >
                  <ChevronDown size={14} />
                </Button>
              </li>
            ) : null,
          )}
        </ul>
      )}

      <div className="flex items-center justify-between mt-4 mb-1">
        <h6 className="text-2xs uppercase tracking-wide text-muted-foreground font-semibold">
          Hidden
        </h6>
        <Button
          variant="ghost"
          size="sm"
          className="h-7"
          onClick={() => onChange(available.map((f) => f.name))}
          disabled={hidden.length === 0}
        >
          Show all
        </Button>
      </div>

      {hidden.length === 0 ? (
        <p className="text-sm text-muted-foreground py-1">Every property is shown.</p>
      ) : (
        <ul className="flex flex-col">
          {hidden.map((name) =>
            matches(name) ? (
              <li key={name} className="flex items-center gap-2 py-1">
                <Switch
                  checked={false}
                  aria-label={`Show ${label(name)}`}
                  // Turning a property on appends it, so the newly shown column
                  // appears where the user is looking rather than mid-table.
                  onCheckedChange={() => onChange([...shown, name])}
                />
                <span className="text-sm flex-1 min-w-0 truncate text-muted-foreground">
                  {label(name)}
                </span>
              </li>
            ) : null,
          )}
        </ul>
      )}
    </div>
  );
}
