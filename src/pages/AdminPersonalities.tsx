import { useState, useMemo, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import {
  fetchPersonalityInternalNote,
  upsertPersonalityInternalNote,
} from '@/hooks/usePageFetchers';
import { usePersonalities } from '@/hooks/usePersonalities';
import { toast } from '@/hooks/use-toast';
import { PersonalitiesCsvImport } from '@/components/personalities/PersonalitiesCsvImport';
import { AdultModelsCsvImport } from '@/components/personalities/AdultModelsCsvImport';
import { BulkCreatePersonalities } from '@/components/personalities/BulkCreatePersonalities';
import { ExportExcelButton } from '@/components/admin/ExportExcelButton';
import {
  exportToExcel,
  fetchAllRows,
  formatDate,
  formatDateTime,
  formatArray,
  formatBoolean,
  generateFilename,
  type ExportColumnDef,
} from '@/utils/excelExport';
import { AdminEntityTable } from '@/components/admin/data-table';
import type { AdminTableConfig, AdminColumnMeta } from '@/components/admin/data-table/types';
import { createColumnHelper } from '@tanstack/react-table';
import {
  Edit,
  Trash2,
  Check,
  AlertCircle,
  Star,
  Eye,
  Calendar,
  MapPin,
  ExternalLink,
} from 'lucide-react';

interface PersonalityRow {
  id: string;
  name: string;
  pronouns: string | null;
  image_url: string | null;
  profession: string | null;
  nationality: string | null;
  birth_place: string | null;
  birth_date: string | null;
  death_date: string | null;
  is_living: boolean;
  verification_status: string;
  visibility: string;
  is_featured: boolean;
  view_count: number;
  website_url: string | null;
  created_at: string;
}

const columnHelper = createColumnHelper<PersonalityRow>();

function VerificationBadge({ status }: { status: string }) {
  if (status === 'verified')
    return (
      <Badge style={{ backgroundColor: '#dcfce7', color: '#166534' }}>
        <Check style={{ height: 12, width: 12, marginRight: 4 }} />
        Verified
      </Badge>
    );
  if (status === 'disputed')
    return (
      <Badge style={{ backgroundColor: '#fef9c3', color: '#854d0e' }}>
        <AlertCircle style={{ height: 12, width: 12, marginRight: 4 }} />
        Disputed
      </Badge>
    );
  return <Badge variant="secondary">Pending</Badge>;
}

function VisibilityBadge({ visibility }: { visibility: string }) {
  if (visibility === 'public')
    return <Badge style={{ backgroundColor: '#dbeafe', color: '#1e40af' }}>Public</Badge>;
  if (visibility === 'private')
    return <Badge style={{ backgroundColor: '#f3f4f6', color: '#1f2937' }}>Private</Badge>;
  return <Badge style={{ backgroundColor: '#ffedd5', color: '#9a3412' }}>Draft</Badge>;
}

export default function AdminPersonalities() {
  const { updatePersonality, refetchPersonalities } = usePersonalities(false);
  const [selectedPersonality, setSelectedPersonality] = useState<PersonalityRow | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [internalNotes, setInternalNotes] = useState('');
  const [internalNotesLoaded, setInternalNotesLoaded] = useState('');
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesSaving, setNotesSaving] = useState(false);

  useEffect(() => {
    if (!editDialogOpen || !selectedPersonality) {
      setInternalNotes('');
      setInternalNotesLoaded('');
      return;
    }
    let cancelled = false;
    setNotesLoading(true);
    (async () => {
      try {
        const notes = (await fetchPersonalityInternalNote(selectedPersonality.id)) ?? '';
        if (cancelled) return;
        setInternalNotes(notes);
        setInternalNotesLoaded(notes);
      } catch {
        if (!cancelled) {
          toast({
            title: 'Error',
            description: 'Failed to load internal notes',
            variant: 'destructive',
          });
        }
      } finally {
        if (!cancelled) setNotesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editDialogOpen, selectedPersonality]);

  const saveInternalNotes = async () => {
    if (!selectedPersonality) return;
    setNotesSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await upsertPersonalityInternalNote({
      personality_id: selectedPersonality.id,
      notes: internalNotes,
      updated_by: user?.id ?? null,
    });
    setNotesSaving(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    setInternalNotesLoaded(internalNotes);
    toast({ title: 'Gespeichert', description: 'Interne Notizen aktualisiert' });
  };

  const handleVerificationChange = async (id: string, status: string) => {
    try {
      await updatePersonality(id, { verification_status: status });
      toast({ title: 'Success', description: `Verification updated to ${status}` });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to update verification',
        variant: 'destructive',
      });
    }
  };

  const handleFeaturedToggle = async (id: string, featured: boolean) => {
    try {
      await updatePersonality(id, { is_featured: featured });
      toast({ title: 'Success', description: featured ? 'Featured' : 'Unfeatured' });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to update featured status',
        variant: 'destructive',
      });
    }
  };

  const handleVisibilityChange = async (id: string, visibility: string) => {
    try {
      await updatePersonality(id, { visibility });
      toast({ title: 'Success', description: `Visibility changed to ${visibility}` });
    } catch {
      toast({ title: 'Error', description: 'Failed to update visibility', variant: 'destructive' });
    }
  };

  const handleExportExcel = async () => {
    const cols: ExportColumnDef<Record<string, unknown>>[] = [
      { header: 'Name', accessor: (r) => r.name },
      { header: 'Pronouns', accessor: (r) => r.pronouns },
      { header: 'Profession', accessor: (r) => r.profession },
      { header: 'Nationality', accessor: (r) => r.nationality },
      { header: 'Birth Place', accessor: (r) => r.birth_place },
      { header: 'Birth Date', accessor: (r) => formatDate(r.birth_date) },
      {
        header: 'Age',
        accessor: (r) => {
          if (!r.birth_date) return '';
          const birth = new Date(r.birth_date as string);
          const end =
            !r.is_living && r.death_date ? new Date(r.death_date as string) : new Date();
          let age = end.getFullYear() - birth.getFullYear();
          const m = end.getMonth() - birth.getMonth();
          if (m < 0 || (m === 0 && end.getDate() < birth.getDate())) age--;
          return age >= 0 && Number.isFinite(age) ? age : '';
        },
      },
      { header: 'Death Date', accessor: (r) => formatDate(r.death_date) },
      { header: 'Is Living', accessor: (r) => formatBoolean(r.is_living) },
      { header: 'Verification', accessor: (r) => r.verification_status },
      { header: 'Visibility', accessor: (r) => r.visibility },
      { header: 'Featured', accessor: (r) => formatBoolean(r.is_featured) },
      { header: 'View Count', accessor: (r) => r.view_count },
      { header: 'Tags', accessor: (r) => formatArray(r.tags) },
      { header: 'Website', accessor: (r) => r.website_url },
      { header: 'Created At', accessor: (r) => formatDateTime(r.created_at) },
    ];
    const allData = await fetchAllRows('personalities', '*', { column: 'name', ascending: true });
    await exportToExcel(allData, cols, generateFilename('personalities'));
  };

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'avatar',
        header: '',
        cell: ({ row }) => {
          const p = row.original;
          return (
            <Avatar style={{ height: 36, width: 36 }}>
              <AvatarImage src={p.image_url ?? undefined} alt={p.name} />
              <AvatarFallback style={{ fontSize: 12 }}>
                {p.name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2)}
              </AvatarFallback>
            </Avatar>
          );
        },
        meta: { hideable: false } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('name', {
        header: 'Name',
        cell: (info) => (
          <div>
            <span style={{ fontWeight: 500 }}>{info.getValue()}</span>
            {info.row.original.pronouns && (
              <p className="text-sm text-muted-foreground">
                {info.row.original.pronouns}
              </p>
            )}
          </div>
        ),
        meta: { serverSortable: true, hideable: false } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('profession', {
        header: 'Profession',
        cell: (info) => info.getValue() || '-',
        meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('nationality', {
        header: 'Nationality',
        cell: (info) => {
          const val = info.getValue();
          return val ? (
            <div className="flex items-center gap-1">
              <MapPin style={{ height: 12, width: 12 }} />
              {val}
            </div>
          ) : (
            '-'
          );
        },
        meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('birth_date', {
        header: 'Born',
        cell: (info) => {
          const p = info.row.original;
          if (!p.birth_date) return '-';
          const born = new Date(p.birth_date).getFullYear();
          const died =
            !p.is_living && p.death_date ? ` - ${new Date(p.death_date).getFullYear()}` : '';
          return (
            <div className="flex items-center gap-1">
              <Calendar style={{ height: 12, width: 12 }} />
              {born}
              {died}
            </div>
          );
        },
        meta: {
          serverSortable: true,
          hideable: true,
        } satisfies AdminColumnMeta,
      }),
      columnHelper.display({
        id: 'age',
        header: 'Age',
        cell: ({ row }) => {
          const p = row.original;
          if (!p.birth_date) return '-';
          const birth = new Date(p.birth_date);
          const end = !p.is_living && p.death_date ? new Date(p.death_date) : new Date();
          let age = end.getFullYear() - birth.getFullYear();
          const m = end.getMonth() - birth.getMonth();
          if (m < 0 || (m === 0 && end.getDate() < birth.getDate())) age--;
          if (age < 0 || !Number.isFinite(age)) return '-';
          return !p.is_living && p.death_date ? `${age} (†)` : age;
        },
        meta: { hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('visibility', {
        header: 'Visibility',
        cell: (info) => (
          <div className="flex flex-col gap-1">
            <VisibilityBadge visibility={info.getValue()} />
            {info.row.original.is_featured && (
              <Badge style={{ backgroundColor: '#f3e8ff', color: '#6b21a8' }}>
                <Star style={{ height: 12, width: 12, marginRight: 4 }} />
                Featured
              </Badge>
            )}
          </div>
        ),
        meta: {
          serverSortable: true,
          serverFilterable: true,
          hideable: true,
        } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('verification_status', {
        header: 'Verification',
        cell: (info) => <VerificationBadge status={info.getValue()} />,
        meta: {
          serverSortable: true,
          serverFilterable: true,
          hideable: true,
        } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('view_count', {
        header: 'Views',
        cell: (info) => (
          <div className="flex items-center gap-1">
            <Eye style={{ height: 12, width: 12 }} />
            {info.getValue()?.toLocaleString() ?? 0}
          </div>
        ),
        meta: {
          serverSortable: true,
          defaultVisible: false,
          hideable: true,
        } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('created_at', {
        header: 'Created',
        cell: (info) => new Date(info.getValue()).toLocaleDateString(),
        meta: {
          serverSortable: true,
          defaultVisible: false,
          hideable: true,
        } satisfies AdminColumnMeta,
      }),
    ],
    [],
  );

  const tableConfig: AdminTableConfig<PersonalityRow> = useMemo(
    () => ({
      tableName: 'personalities',
      select:
        'id,name,pronouns,image_url,profession,nationality,birth_place,birth_date,death_date,is_living,verification_status,visibility,is_featured,view_count,website_url,created_at',
      columns,
      defaultSort: { column: 'name', direction: 'asc' },
      defaultPageSize: 50,
      enableSelection: true,
      enableSearch: true,
      searchColumns: ['name', 'profession', 'nationality', 'birth_place'],
      entityFilters: [
        {
          key: 'verification_status',
          label: 'Verification',
          type: 'select',
          column: 'verification_status',
          options: [
            { value: 'verified', label: 'Verified' },
            { value: 'pending', label: 'Pending' },
            { value: 'disputed', label: 'Disputed' },
          ],
        },
        {
          key: 'visibility',
          label: 'Visibility',
          type: 'select',
          column: 'visibility',
          options: [
            { value: 'public', label: 'Public' },
            { value: 'private', label: 'Private' },
            { value: 'draft', label: 'Draft' },
          ],
        },
        {
          key: 'is_featured',
          label: 'Featured',
          type: 'boolean',
          column: 'is_featured',
        },
      ],
      bulkEditFields: [
        {
          key: 'verification_status',
          label: 'Verification Status',
          type: 'select',
          column: 'verification_status',
          options: [
            { value: 'verified', label: 'Verified' },
            { value: 'pending', label: 'Pending' },
            { value: 'disputed', label: 'Disputed' },
          ],
        },
        {
          key: 'visibility',
          label: 'Visibility',
          type: 'select',
          column: 'visibility',
          options: [
            { value: 'public', label: 'Public' },
            { value: 'private', label: 'Private' },
            { value: 'draft', label: 'Draft' },
          ],
        },
        { key: 'is_featured', label: 'Featured', type: 'boolean', column: 'is_featured' },
      ],
      rowActions: [
        {
          key: 'edit',
          label: 'Edit',
          icon: Edit,
          onClick: (p) => {
            setSelectedPersonality(p);
            setEditDialogOpen(true);
          },
        },
        {
          key: 'verify',
          label: 'Toggle Verify',
          icon: Check,
          onClick: (p) =>
            handleVerificationChange(
              p.id,
              p.verification_status === 'verified' ? 'pending' : 'verified',
            ),
        },
        {
          key: 'feature',
          label: 'Toggle Feature',
          icon: Star,
          onClick: (p) => handleFeaturedToggle(p.id, !p.is_featured),
        },
        {
          key: 'visibility',
          label: 'Toggle Visibility',
          icon: Eye,
          onClick: (p) =>
            handleVisibilityChange(p.id, p.visibility === 'public' ? 'private' : 'public'),
        },
        {
          key: 'website',
          label: 'Visit Website',
          icon: ExternalLink,
          onClick: (p) => window.open(p.website_url!, '_blank'),
          visible: (p) => !!p.website_url,
        },
        {
          key: 'delete',
          label: 'Delete',
          icon: Trash2,
          variant: 'destructive',
          onClick: (p) => {
            setSelectedPersonality(p);
          },
        },
      ],
      toolbarActions: (
        <div className="flex gap-1 flex-wrap">
          <PersonalitiesCsvImport onImportComplete={refetchPersonalities} />
          <AdultModelsCsvImport onImportComplete={refetchPersonalities} />
          <ExportExcelButton onExport={handleExportExcel} />
        </div>
      ),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers are stable, adding would defeat memoization
    [columns],
  );

  return (
    <AdminEntityTable
      title="Personalities Management"
      subtitle="Manage and moderate LGBTQ+ personalities in the directory"
      backHref={null}
      config={tableConfig}
      beforeTable={
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <BulkCreatePersonalities />
        </div>
      }
      afterTable={
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent style={{ maxWidth: 672 }}>
          <DialogHeader>
            <DialogTitle>Edit Personality</DialogTitle>
          </DialogHeader>
          {selectedPersonality && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Verification Status</Label>
                  <Select
                    value={selectedPersonality.verification_status}
                    onValueChange={(v) => handleVerificationChange(selectedPersonality.id, v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="verified">Verified</SelectItem>
                      <SelectItem value="disputed">Disputed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Visibility</Label>
                  <Select
                    value={selectedPersonality.visibility}
                    onValueChange={(v) => handleVisibilityChange(selectedPersonality.id, v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="public">Public</SelectItem>
                      <SelectItem value="private">Private</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="featured"
                  checked={selectedPersonality.is_featured}
                  onChange={(e) => handleFeaturedToggle(selectedPersonality.id, e.target.checked)}
                />
                <Label htmlFor="featured">Featured Personality</Label>
              </div>
              <div>
                <Label htmlFor="internal-notes">Interne Notizen</Label>
                <p className="text-xs text-muted-foreground">
                  Nur intern sichtbar — wird nicht öffentlich angezeigt.
                </p>
                <Textarea
                  id="internal-notes"
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  placeholder={notesLoading ? 'Laden…' : 'Interne Vermerke zu dieser Person'}
                  rows={5}
                  disabled={notesLoading || notesSaving}
                />
                <div className="flex justify-end mt-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={saveInternalNotes}
                    disabled={
                      notesLoading || notesSaving || internalNotes === internalNotesLoaded
                    }
                  >
                    {notesSaving ? 'Speichern…' : 'Notizen speichern'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      }
    />
  );
}
