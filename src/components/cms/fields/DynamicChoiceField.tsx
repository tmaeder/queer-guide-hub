import type { FieldProps } from './FieldRenderer';
import { SelectField } from './SelectField';
import { MultiSelectField } from './MultiSelectField';
import { selectableOptions, useManagedOptions } from '@/hooks/useManagedOptions';

export function DynamicChoiceField(props: FieldProps) {
  const { field, value, allValues } = props;
  const source = field.dynamicOptions!;
  const scoped =
    source.table === 'taxonomy_terms' && field.name === 'parent_id'
      ? { ...source, filters: { ...source.filters, taxonomy: String(allValues?.taxonomy ?? '') } }
      : source;
  const result = useManagedOptions(scoped);
  const browse = source.table === 'taxonomy_terms' && !!source.valuePrefix;
  const ancestry = useManagedOptions(browse ? { ...source, valuePrefix: undefined } : undefined);
  const byId = new Map(ancestry.options.map((option) => [String(option.data?.id), option]));
  const selected = new Set(Array.isArray(value) ? value : [value]);
  const group = ancestry.options.find(
    (option) => option.value === `group:${allValues?.subcategory_group ?? ''}`,
  );
  const available = result.options.filter((option) => {
    if (!browse || selected.has(option.value)) return true;
    if (field.name === 'subcategory_fine' && option.data?.parent_id !== group?.data?.id)
      return false;
    let parent = option.data?.parent_id;
    const seen = new Set<unknown>();
    while (parent) {
      if (seen.has(parent)) return false;
      seen.add(parent);
      const ancestor = byId.get(String(parent));
      if (!ancestor?.active) return false;
      parent = ancestor.data?.parent_id;
    }
    return true;
  });
  const options = selectableOptions(available, value).filter(
    (option) => field.name !== 'parent_id' || option.value !== allValues?.id,
  );
  const Component = field.type === 'multiselect' ? MultiSelectField : SelectField;
  const loading = result.loading || (browse && ancestry.loading);
  const error = result.error ?? (browse ? ancestry.error : null);
  const onChange = (next: unknown) => {
    if (field.name === 'subcategory_group' && next !== value)
      props.setFields?.({ subcategory_fine: null });
    props.onChange(next === '' && (source.valueColumn === 'id' || browse) ? null : next);
  };
  return (
    <div>
      <Component
        {...props}
        field={{ ...field, options }}
        onChange={onChange}
        disabled={props.disabled || loading || !!error}
      />
      {loading && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading choices…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}{' '}
          <button
            type="button"
            className="underline"
            onClick={() => {
              result.retry();
              if (browse) ancestry.retry();
            }}
          >
            Retry
          </button>
        </p>
      )}
    </div>
  );
}
