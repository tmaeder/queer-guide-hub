/**
 * /admin/business/:id — one business, all its roles. Identity header +
 * per-role tabs listing linked entities with link/unlink. Scalar fields are
 * edited in the registry CMS (organizations content type); this page owns
 * relationships, roles and (later) claims.
 */
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ExternalLink, Link2, Loader2, Unlink } from 'lucide-react';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { OrgEntityPickerDialog } from '@/components/admin/business/OrgEntityPickerDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ORG_ROLE_LABELS,
  useAdminOrg,
  useLinkOrgEntity,
  useOrgLinkedEntities,
  type LinkedEntityRow,
  type OrgEntityType,
} from '@/hooks/useBusinessSpine';
import { toast } from 'sonner';

const ROLE_TABS: { type: OrgEntityType; label: string }[] = [
  { type: 'venue', label: 'Venues' },
  { type: 'hotel', label: 'Hotels' },
  { type: 'merchant', label: 'Merchants' },
  { type: 'brand', label: 'Brands' },
  { type: 'affiliate_partner', label: 'Partners' },
];

function LinkedList({
  orgId,
  entityType,
  rows,
}: {
  orgId: string;
  entityType: OrgEntityType | 'news_source';
  rows: LinkedEntityRow[];
}) {
  const link = useLinkOrgEntity(orgId);

  const onUnlink = async (row: LinkedEntityRow) => {
    try {
      await link.mutateAsync({ entityType, entityId: row.id, unlink: true });
      toast.success(`Unlinked ${row.name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unlink failed');
    }
  };

  if (rows.length === 0) {
    return <p className="py-4 text-13 text-muted-foreground">Nothing linked yet.</p>;
  }
  return (
    <ul className="flex flex-col divide-y">
      {rows.map((row) => (
        <li key={row.id} className="flex items-center gap-2 py-2">
          <span className="font-medium">{row.name}</span>
          {row.detail && <span className="text-13 text-muted-foreground">{row.detail}</span>}
          <span className="ml-auto flex items-center gap-1">
            {row.editHref && (
              <Button variant="ghost" size="sm" asChild>
                <Link to={row.editHref} aria-label={`Open ${row.name} in its console`}>
                  <ExternalLink size={14} />
                </Link>
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              disabled={link.isPending}
              onClick={() => onUnlink(row)}
              aria-label={`Unlink ${row.name}`}
            >
              <Unlink size={14} />
            </Button>
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function AdminBusinessDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: org, isLoading } = useAdminOrg(id);
  const { data: linked } = useOrgLinkedEntities(id);
  const [pickerType, setPickerType] = useState<OrgEntityType | null>(null);

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin" aria-label="Loading" />
      </div>
    );
  }
  if (!org) {
    return <p className="p-6 text-13 text-muted-foreground">Business not found.</p>;
  }

  const linkedCount = (type: OrgEntityType | 'news_source') => linked?.[type]?.length ?? 0;

  return (
    <div className="p-6">
      <AdminPageHeader
        eyebrow="COCKPIT · BUSINESS"
        title={
          <span className="flex items-center gap-2">
            {org.logo_url && (
              <img src={org.logo_url} alt="" className="h-8 w-8 rounded-badge object-cover" />
            )}
            {org.name}
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {org.roles.map((r) => (
              <Badge key={r} variant="outline" className="font-normal">
                {ORG_ROLE_LABELS[r] ?? r}
              </Badge>
            ))}
            {org.website_domain && <span>{org.website_domain}</span>}
            {org.claim_status !== 'unclaimed' && (
              <Badge variant="secondary" className="font-normal">
                claim: {org.claim_status}
              </Badge>
            )}
          </span>
        }
        backTo={{ label: 'Business', route: '/admin/business' }}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/content/organizations">Edit fields in CMS</Link>
          </Button>
        }
      />

      <Tabs defaultValue="overview">
        <TabsList className="mb-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {ROLE_TABS.map((t) => (
            <TabsTrigger key={t.type} value={t.type}>
              {t.label}
              {linkedCount(t.type) > 0 ? ` (${linkedCount(t.type)})` : ''}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview">
          <dl className="grid max-w-xl grid-cols-2 gap-x-6 gap-y-2 text-15">
            <dt className="text-muted-foreground">Status</dt>
            <dd>{org.status}</dd>
            <dt className="text-muted-foreground">Trust</dt>
            <dd>{org.trust_score ?? '—'}</dd>
            <dt className="text-muted-foreground">Completeness</dt>
            <dd>{org.completeness_score}</dd>
            <dt className="text-muted-foreground">Contact</dt>
            <dd>{[org.email, org.phone].filter(Boolean).join(' · ') || '—'}</dd>
            <dt className="text-muted-foreground">Website</dt>
            <dd>
              {org.website ? (
                <a href={org.website} target="_blank" rel="noreferrer">
                  {org.website_domain ?? org.website}
                </a>
              ) : (
                '—'
              )}
            </dd>
            <dt className="text-muted-foreground">News sources</dt>
            <dd>{linkedCount('news_source') || '—'}</dd>
            <dt className="text-muted-foreground">Public page</dt>
            <dd>
              <Link to={`/organizations/${org.slug}`} className="inline-flex items-center gap-1">
                /organizations/{org.slug} <ExternalLink size={12} />
              </Link>
            </dd>
          </dl>
        </TabsContent>

        {ROLE_TABS.map((t) => (
          <TabsContent key={t.type} value={t.type}>
            <div className="mb-2 flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setPickerType(t.type)}>
                <Link2 size={14} className="mr-1" />
                Link existing…
              </Button>
            </div>
            <LinkedList orgId={org.id} entityType={t.type} rows={linked?.[t.type] ?? []} />
          </TabsContent>
        ))}
      </Tabs>

      {pickerType && (
        <OrgEntityPickerDialog
          orgId={org.id}
          entityType={pickerType}
          typeLabel={ROLE_TABS.find((t) => t.type === pickerType)?.label.replace(/s$/, '') ?? pickerType}
          open={Boolean(pickerType)}
          onOpenChange={(open) => !open && setPickerType(null)}
        />
      )}
    </div>
  );
}
