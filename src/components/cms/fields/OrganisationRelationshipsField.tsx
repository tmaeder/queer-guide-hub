import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { OrgEntityPickerDialog } from '@/components/admin/business/OrgEntityPickerDialog';
import { MerchantsManager } from '@/components/admin/affiliate/MerchantsManager';
import { AffiliatePartnersManager } from '@/components/admin/AffiliatePartnersManager';
import {
  useOrgLinkedEntities,
  useLinkOrgEntity,
  type OrgEntityType,
} from '@/hooks/useBusinessSpine';
import type { FieldProps } from './FieldRenderer';

const RELATIONS: { type: Exclude<OrgEntityType, 'venue'>; label: string }[] = [
  { type: 'hotel', label: 'Hotels' },
  { type: 'merchant', label: 'Merchants' },
  { type: 'brand', label: 'Brands' },
  { type: 'affiliate_partner', label: 'Partners' },
];

/** Commercial relationships use existing RPCs and save independently of identity fields. */
export function OrganisationRelationshipsField({
  allValues,
  disabled,
  onPersistedChange,
}: FieldProps) {
  const orgId = typeof allValues?.id === 'string' ? allValues.id : undefined;
  const dirty = Boolean(allValues?._editor_is_dirty);
  const { data, isLoading, error, refetch } = useOrgLinkedEntities(orgId);
  const link = useLinkOrgEntity(orgId ?? '');
  const [picker, setPicker] = useState<(typeof RELATIONS)[number] | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = Boolean(disabled || dirty || busy || link.isPending);

  const unlink = async (entityType: OrgEntityType | 'news_source', entityId: string) => {
    setBusy(true);
    try {
      await link.mutateAsync({ entityType, entityId, unlink: true });
      await onPersistedChange?.();
      toast.success('Relationship removed');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not remove relationship');
    } finally {
      setBusy(false);
    }
  };

  if (!orgId)
    return (
      <p className="text-sm text-muted-foreground">
        Save this Organisation before linking business records.
      </p>
    );
  if (isLoading) return <TrackLoader size={24} label="Loading relationships" />;
  if (error)
    return (
      <div role="alert">
        <p>Could not load relationships.</p>
        <Button variant="outline" onClick={() => void refetch()}>
          Retry
        </Button>
      </div>
    );

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {dirty
          ? 'Save or reset your Organisation edits before changing relationships.'
          : 'Relationship changes save immediately. Locations are managed in the Locations tab.'}
      </p>
      {RELATIONS.map((relation) => (
        <section
          key={relation.type}
          className="space-y-4 border-t pt-4"
          aria-label={relation.label}
        >
          <div className="flex items-center justify-between gap-4">
            <h3 className="font-medium">{relation.label}</h3>
            <Button
              variant="outline"
              size="sm"
              disabled={locked}
              onClick={() => setPicker(relation)}
            >
              Link existing…
            </Button>
          </div>
          {(data?.[relation.type] ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing linked yet.</p>
          )}
          {(data?.[relation.type] ?? []).map((row) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="font-medium">{row.name}</span>
                {row.detail && <p className="text-sm text-muted-foreground">{row.detail}</p>}
              </div>
              <div className="flex gap-2">
                {row.editHref && (
                  <Button variant="ghost" size="sm" asChild>
                    <Link to={row.editHref} target="_blank" rel="noopener noreferrer">
                      Manage
                    </Link>
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={locked}
                  onClick={() => void unlink(relation.type, row.id)}
                >
                  Unlink
                </Button>
              </div>
            </div>
          ))}
          {relation.type === 'merchant' && (
            <fieldset disabled={locked} className="min-w-0">
              <MerchantsManager organizationId={orgId} />
            </fieldset>
          )}
          {relation.type === 'affiliate_partner' && (
            <fieldset disabled={locked} className="min-w-0">
              <AffiliatePartnersManager organizationId={orgId} embedded />
            </fieldset>
          )}
        </section>
      ))}
      {(data?.news_source ?? []).length > 0 && (
        <section aria-label="News sources" className="space-y-4 border-t pt-4">
          <h3 className="font-medium">News sources</h3>
          {data?.news_source.map((row) => (
            <div key={row.id} className="flex items-center justify-between gap-2">
              <span>{row.name}</span>
              <Button
                variant="ghost"
                size="sm"
                disabled={locked}
                onClick={() => void unlink('news_source', row.id)}
              >
                Unlink
              </Button>
            </div>
          ))}
        </section>
      )}
      {picker && (
        <OrgEntityPickerDialog
          orgId={orgId}
          entityType={picker.type}
          typeLabel={picker.label.replace(/s$/, '')}
          open
          onOpenChange={(open) => {
            if (!open) setPicker(null);
          }}
          onLinked={onPersistedChange}
        />
      )}
    </div>
  );
}
