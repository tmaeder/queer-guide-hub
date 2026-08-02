import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import type { FieldConfig, SelectOption } from '@/types/cms';
import { widgetFor, type FilterOperator } from '../fieldCapabilities';

/**
 * The value half of a filter row. The only file that knows which control a
 * given (field, operator) pair needs.
 *
 * `widgetFor` returning 'none' renders NOTHING — not a disabled input. A greyed
 * empty box next to "is empty" reads as broken rather than as intentional.
 */

interface Props {
  field: FieldConfig;
  op: FilterOperator;
  value: unknown;
  options: SelectOption[];
  onChange: (value: unknown) => void;
}

type Range = { from?: unknown; to?: unknown; min?: unknown; max?: unknown };

export function FilterValueInput({ field, op, value, options, onChange }: Props) {
  const widget = widgetFor(field, op);
  if (widget === 'none') return null;

  if (widget === 'select-multi') {
    return <MultiSelectValue field={field} value={value} options={options} onChange={onChange} />;
  }

  if (widget === 'number-range' || widget === 'date-range') {
    const range = (value ?? {}) as Range;
    const isNum = widget === 'number-range';
    const lo = (isNum ? range.min : range.from) ?? '';
    const hi = (isNum ? range.max : range.to) ?? '';
    const set = (part: 'lo' | 'hi', raw: string) => {
      const next: Range = { ...range };
      const v = raw === '' ? undefined : isNum ? Number(raw) : raw;
      if (isNum) {
        if (part === 'lo') next.min = v;
        else next.max = v;
      } else if (part === 'lo') next.from = v;
      else next.to = v;
      onChange(next);
    };
    return (
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <Input
          type={isNum ? 'number' : 'date'}
          aria-label={`${field.label} from`}
          value={String(lo)}
          onChange={(e) => set('lo', e.target.value)}
          className="h-8"
        />
        <span aria-hidden="true" className="text-muted-foreground">
          –
        </span>
        <Input
          type={isNum ? 'number' : 'date'}
          aria-label={`${field.label} to`}
          value={String(hi)}
          onChange={(e) => set('hi', e.target.value)}
          className="h-8"
        />
      </div>
    );
  }

  return (
    <Input
      type={widget === 'number' ? 'number' : widget === 'date' ? 'date' : 'text'}
      aria-label={`${field.label} value`}
      value={value === undefined || value === null ? '' : String(value)}
      onChange={(e) => {
        const raw = e.target.value;
        onChange(widget === 'number' ? (raw === '' ? undefined : Number(raw)) : raw);
      }}
      className="h-8 flex-1 min-w-0"
      placeholder="Value"
    />
  );
}

function MultiSelectValue({ field, value, options, onChange }: Omit<Props, 'op'>) {
  const selected = Array.isArray(value) ? (value as unknown[]).map(String) : [];
  const labelFor = (v: string) => options.find((o) => o.value === v)?.label ?? v;

  const toggle = (v: string) => {
    const next = selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v];
    onChange(next);
  };

  const summary =
    selected.length === 0
      ? 'Select…'
      : selected.length <= 2
        ? selected.map(labelFor).join(', ')
        : `${selected.length} selected`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 flex-1 min-w-0 justify-between font-normal"
          aria-label={`${field.label} values`}
        >
          <span className="truncate">{summary}</span>
          <ChevronsUpDown size={14} className="ml-2 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-0" align="start">
        <Command>
          <CommandInput placeholder={`Find ${field.label.toLowerCase()}`} />
          <CommandList>
            <CommandEmpty>No matches.</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem key={o.value} value={o.label} onSelect={() => toggle(o.value)}>
                  <Check
                    size={14}
                    className={`mr-2 ${selected.includes(o.value) ? 'opacity-100' : 'opacity-0'}`}
                  />
                  {o.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
