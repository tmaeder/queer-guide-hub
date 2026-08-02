import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { FieldConfig, SelectOption } from '@/types/cms';
import { capabilitiesFor, type FilterOperator } from '../fieldCapabilities';
import { OPERATOR_LABELS } from '../filterOps';
import type { Filter } from '../viewSpec';
import { FilterValueInput } from './FilterValueInput';

/**
 * One filter: which field, which operator, what value.
 *
 * Fields that cannot be filtered are still LISTED, disabled, with the reason
 * from `capabilitiesFor`. Hiding them makes people hunt for a field that is
 * right there in the editor; showing a working-looking control that the query
 * ignores is worse. Saying "Computed field — no stored value to filter on"
 * answers the question.
 */

interface Props {
  filter: Filter;
  index: number;
  fields: FieldConfig[];
  optionsFor: (field: FieldConfig) => SelectOption[];
  onChange: (next: Filter) => void;
  onRemove: () => void;
}

export function FilterRow({ filter, index, fields, optionsFor, onChange, onRemove }: Props) {
  const field = fields.find((f) => f.name === filter.field);
  const caps = field ? capabilitiesFor(field) : null;
  const operators = caps?.operators ?? [];

  const changeField = (name: string) => {
    const next = fields.find((f) => f.name === name);
    if (!next) return;
    const nextOps = capabilitiesFor(next).operators;
    // Keep the operator when the new field supports it, so switching between
    // two text fields does not silently reset what was typed.
    const op = nextOps.includes(filter.op) ? filter.op : nextOps[0];
    onChange({
      ...filter,
      field: name,
      op,
      value: nextOps.includes(filter.op) ? filter.value : undefined,
    });
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground w-12 shrink-0">
        {index === 0 ? 'Where' : 'and'}
      </span>

      <Select value={filter.field} onValueChange={changeField}>
        <SelectTrigger className="h-8 w-[150px] shrink-0" aria-label="Filter field">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {fields.map((f) => {
            const c = capabilitiesFor(f);
            const disabled = c.operators.length === 0;
            return (
              <SelectItem key={f.name} value={f.name} disabled={disabled}>
                <span className="flex flex-col items-start">
                  <span>{f.label}</span>
                  {disabled && c.unfilterableReason && (
                    <span className="text-2xs text-muted-foreground">{c.unfilterableReason}</span>
                  )}
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

      <Select
        value={filter.op}
        onValueChange={(op) => onChange({ ...filter, op: op as FilterOperator, value: undefined })}
      >
        <SelectTrigger className="h-8 w-[140px] shrink-0" aria-label="Filter condition">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {operators.map((op) => (
            <SelectItem key={op} value={op}>
              {OPERATOR_LABELS[op]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {field && (
        <FilterValueInput
          field={field}
          op={filter.op}
          value={filter.value}
          options={optionsFor(field)}
          onChange={(value) => onChange({ ...filter, value })}
        />
      )}

      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 shrink-0"
        aria-label={`Remove filter: ${field?.label ?? filter.field}`}
        onClick={onRemove}
      >
        <X size={14} />
      </Button>
    </div>
  );
}
