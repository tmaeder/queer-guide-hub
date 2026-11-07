import { ExternalLink } from '@/components/icons';
import { Button } from '@/components/ui/button';
import type { BusinessMergeEvidence } from '@/hooks/useReviewCase';
import { reviewHttpUrl } from './reviewEvidence';

const fieldLabels: Record<string, string> = {
  description: 'Description',
  description_i18n: 'Translations',
  website: 'Website',
  email: 'Email',
  phone: 'Phone',
  address: 'Address',
  postal_code: 'Postal code',
  latitude: 'Latitude',
  longitude: 'Longitude',
  social: 'Social profiles',
  timezone: 'Time zone',
};

export function BusinessMergeContext({
  value,
  onOpenOrganization,
}: {
  value: BusinessMergeEvidence;
  onOpenOrganization: (id: string) => void;
}) {
  const mergeDate = value.venue_merge_at ? new Date(value.venue_merge_at) : null;
  const pendingFields = value.pending_fields.map((field) => fieldLabels[field] ?? field);
  const survivingOrganizationId = value.surviving_organization?.id;
  const rows = [
    { label: 'Organization under review', record: value.organization },
    { label: 'Organization linked to the surviving venue', record: value.surviving_organization },
    { label: 'Previous venue', record: value.previous_venue },
    { label: 'Surviving venue', record: value.surviving_venue },
  ].filter(({ record }) => record !== null);

  return (
    <section aria-label="Business and venue records" className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Business and venue records</h3>
        {mergeDate && Number.isFinite(mergeDate.getTime()) && (
          <p className="text-sm text-muted-foreground">
            Venue merge recorded on{' '}
            <time dateTime={value.venue_merge_at ?? undefined}>
              {mergeDate.toLocaleDateString()}
            </time>
            . Confirm that the organization records describe the same business before merging them.
          </p>
        )}
      </div>
      <dl className="grid gap-4 border-y border-border py-4 sm:grid-cols-2">
        {rows.map(({ label, record }) => {
          if (!record) return null;
          const website = reviewHttpUrl(record.website);
          const location =
            record.address || [record.city, record.country].filter(Boolean).join(', ');
          return (
            <div className="min-w-0 space-y-1" key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="break-words text-sm font-medium">{record.name}</dd>
              {location && (
                <dd className="break-words text-sm text-muted-foreground">{location}</dd>
              )}
              {record.closed && <dd className="text-sm">Marked closed in the catalogue</dd>}
              {website && (
                <dd>
                  <a
                    href={website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-8 items-center gap-2 text-sm underline-offset-4 hover:underline"
                  >
                    {label === 'Surviving venue' ? 'Venue website' : 'Organization website'}
                    <ExternalLink size={14} aria-hidden="true" />
                  </a>
                </dd>
              )}
            </div>
          );
        })}
      </dl>
      {!!pendingFields.length && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Fields to verify before merging</h4>
          <p className="text-sm text-muted-foreground">{pendingFields.join(', ')}</p>
        </div>
      )}
      {survivingOrganizationId && (
        <Button variant="outline" onClick={() => onOpenOrganization(survivingOrganizationId)}>
          Open surviving organization editor
        </Button>
      )}
    </section>
  );
}
