import { Filter as FilterIcon, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { FieldConfig, SelectOption } from '@/types/cms';
import { capabilitiesFor } from '../fieldCapabilities';
import type { Filter } from '../viewSpec';
import { FilterRow } from './FilterRow';

/**
 * Add, edit and remove filters on ANY field of the content type.
 *
 * Replaces a fixed row of one control per `filterable` field, which could not
 * be added to, removed from, or given an operator.
 */

interface Props {
  fields: FieldConfig[];
  filters: Filter[];
  optionsFor: (field: FieldConfig) => SelectOption[];
  onChange: (filters: Filter[]) => void;
}

let seq = 0;
function newId(): string {
  // crypto.randomUUID is unavailable in some older jsdom/browser combos, and a
  // filter id only needs to be unique within this list.
  seq += 1;
  return `flt-${Date.now().toString(36)}-${seq}`;
}

export function FilterBuilder({ fields, filters, optionsFor, onChange }: Props) {
  const firstFilterable = fields.find((f) => capabilitiesFor(f).operators.length > 0);

  const add = () => {
    if (!firstFilterable) return;
    const op = capabilitiesFor(firstFilterable).operators[0];
    onChange([...filters, { id: newId(), field: firstFilterable.name, op, value: undefined }]);
  };

  const active = filters.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-8">
          <FilterIcon size={14} className="mr-1" />
          Filter
          {active > 0 && (
            <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-xs2">
              {active}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[620px] p-4" align="start">
        <div className="flex items-center justify-between mb-2">
          <h6 className="text-2xs uppercase tracking-wide text-muted-foreground font-semibold">
            Filters
          </h6>
          {active > 0 && (
            <Button variant="ghost" size="sm" className="h-7" onClick={() => onChange([])}>
              Clear all
            </Button>
          )}
        </div>

        {active === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No filters yet.</p>
        ) : (
          <div className="flex flex-col gap-2 mb-2">
            {filters.map((f, i) => (
              <FilterRow
                key={f.id}
                filter={f}
                index={i}
                fields={fields}
                optionsFor={optionsFor}
                onChange={(next) => onChange(filters.map((x) => (x.id === f.id ? next : x)))}
                onRemove={() => onChange(filters.filter((x) => x.id !== f.id))}
              />
            ))}
          </div>
        )}

        <Button variant="ghost" size="sm" className="h-8" onClick={add} disabled={!firstFilterable}>
          <Plus size={14} className="mr-1" />
          Add filter
        </Button>
        {!firstFilterable && (
          <p className="text-xs text-muted-foreground mt-2">
            No field on this type can be filtered.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
