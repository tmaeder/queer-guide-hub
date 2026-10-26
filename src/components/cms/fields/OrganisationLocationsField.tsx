import { EntityAuditHistory } from '@/components/cms/EntityAuditHistory';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Plus, MapPin } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { FieldRenderer, type FieldProps } from './FieldRenderer';
import { venueFields } from '@/config/contentTypes/venue';
import { venueContentType } from '@/config/contentTypes/venue';
import { validateAgainstRegistry } from '@/lib/cms/zodFromFields';

export type OrganisationLocation = Record<string, unknown>;

/** Uses the existing location field contract; every branch keeps its own ID and lifecycle. */
export function OrganisationLocationsField({
  value,
  onChange,
  disabled,
  error,
  allValues,
}: FieldProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const locations = useMemo(
    () => (Array.isArray(value) ? (value as OrganisationLocation[]) : []),
    [value],
  );
  // Geocoding callbacks may finish after another field edit or row removal.
  // Merge into the latest value and identify rows by their stable ID, not position.
  const latest = useRef(locations);
  useLayoutEffect(() => {
    latest.current = locations;
  }, [locations]);
  const rowKey = (row: OrganisationLocation, index: number) =>
    String(row.id ?? row._client_id ?? `new-${index}`);
  const commit = (next: OrganisationLocation[]) => {
    latest.current = next;
    onChange(next);
  };
  const update = (key: string, patch: OrganisationLocation) => {
    if (!latest.current.some((row, index) => rowKey(row, index) === key)) return;
    commit(
      latest.current.map((row, index) => (rowKey(row, index) === key ? { ...row, ...patch } : row)),
    );
  };
  return (
    <section aria-label="Organisation locations" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Locations</h2>
          <p className="text-sm text-muted-foreground">
            Each location has its own address, hours and operating status.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() =>
            commit([
              ...latest.current,
              {
                _client_id: crypto.randomUUID(),
                name: '',
                slug: '',
                address: '',
                city: '',
                country: '',
                category: 'other',
                is_featured: false,
                verified: false,
              },
            ])
          }
        >
          <Plus className="mr-2 size-4" />
          Add location
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {locations.length === 0 && (
        <p className="py-4 text-sm text-muted-foreground">
          No locations. An organisation can operate online or without a public address.
        </p>
      )}
      {locations.map((row, index) => {
        const key = rowKey(row, index);
        const open = expanded[key] ?? (!row.id || row.id === allValues?._focused_location_id);
        const validation = validateAgainstRegistry(venueContentType, row);
        const issues = validation.ok ? [] : validation.issues;
        return (
          <details
            key={key}
            open={open}
            onToggle={(event) => {
              const next = event.currentTarget.open;
              if (next !== open) setExpanded((prior) => ({ ...prior, [key]: next }));
            }}
            className="border-b border-border py-4"
          >
            <summary className="cursor-pointer text-sm font-semibold">
              <MapPin className="mr-2 inline size-4" />
              {String(row.name || 'New location')}
              {row.city ? ` · ${row.city}` : ''}
              {row.review_status === 'archived' ? ' · Archived' : ''}
            </summary>
            {open && (
              <div className="mt-4 space-y-6">
                {['basic', 'location', 'details', 'media', 'settings', 'external'].map((group) => (
                  <fieldset key={group} disabled={disabled} className="space-y-4">
                    <legend className="mb-4 text-sm font-medium capitalize">
                      {group === 'basic' ? 'Location identity' : group}
                    </legend>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {venueFields
                        .filter((field) => field.group === group && !field.hidden)
                        .map((field) => (
                          <div
                            key={field.name}
                            className={field.colSpan === 2 ? 'sm:col-span-2' : undefined}
                          >
                            <FieldRenderer
                              field={{ ...field, name: `location-${index}-${field.name}` }}
                              value={row[field.name]}
                              onChange={(next) => update(key, { [field.name]: next })}
                              setFields={(patch) => update(key, patch)}
                              allValues={row}
                              disabled={disabled}
                              error={issues.find((issue) => issue.field === field.name)?.message}
                            />
                          </div>
                        ))}
                    </div>
                  </fieldset>
                ))}
                {Boolean(row.id) && (
                  <EntityAuditHistory sourceTable="venues" sourceId={String(row.id)} />
                )}
                <div className="flex flex-wrap items-center gap-4">
                  {row.id ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={disabled}
                      onClick={() =>
                        update(key, {
                          review_status: row.review_status === 'archived' ? 'pending' : 'archived',
                        })
                      }
                    >
                      {row.review_status === 'archived' ? 'Restore location' : 'Archive location'}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={disabled}
                      onClick={() =>
                        commit(latest.current.filter((item, i) => rowKey(item, i) !== key))
                      }
                    >
                      Discard new location
                    </Button>
                  )}
                  {Boolean(row.slug) && (
                    <a
                      href={`/venues/${row.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm underline"
                    >
                      View location
                    </a>
                  )}
                </div>
              </div>
            )}
          </details>
        );
      })}
    </section>
  );
}
