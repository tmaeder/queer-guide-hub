import { AdminInlineSpinner } from '@/components/admin/primitives/AdminLoading';
import { GovernanceSelectField } from './GovernanceFieldControls';
import {
  classificationSource,
  selectableOptions,
  useManagedOptions,
} from '@/hooks/useManagedOptions';

export function GovernanceTaxonomySelectField({
  kind,
  value,
  ariaLabel,
  onChange,
}: {
  kind: 'venue-category' | 'event-type';
  value: string;
  ariaLabel: string;
  onChange: (value: string) => void;
}) {
  const source =
    kind === 'venue-category'
      ? classificationSource('venue_category')
      : {
          table: 'event_types',
          valueColumn: 'slug',
          labelColumn: 'name',
          orderBy: 'sort_order',
          activeColumn: 'is_active',
        };
  const { options, loading, error, retry } = useManagedOptions(source);
  if (loading) return <AdminInlineSpinner label={`Loading ${ariaLabel.toLowerCase()} choices`} />;
  if (error)
    return (
      <p role="alert" className="text-sm text-destructive">
        {error}{' '}
        <button type="button" className="underline" onClick={retry}>
          Retry
        </button>
      </p>
    );
  return (
    <GovernanceSelectField
      value={value}
      ariaLabel={ariaLabel}
      onChange={onChange}
      options={selectableOptions(options, value)}
    />
  );
}
