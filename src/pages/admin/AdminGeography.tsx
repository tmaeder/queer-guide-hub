import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  Building,
  ChevronDown,
  ChevronRight,
  Globe,
  Home,
  Landmark,
  Lock,
  MapPin,
  Move,
  Plus,
  Trash2,
} from 'lucide-react';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { LANDMARK_KINDS } from '@/lib/landmarkKinds';
import {
  type GeoNode,
  type LandmarkFormValues,
  useDeleteLandmark,
  useGeoChildren,
  useGeoIntegrityViolations,
  useGeoMoveCandidates,
  useGeoMoveNode,
  useLandmarkProfile,
  useLandmarkReview,
  useLandmarkSpine,
  useSaveLandmark,
} from '@/hooks/useGeoPlaces';

const TYPE_ICON: Record<string, typeof Globe> = {
  continent: Globe,
  region: Globe,
  country: Globe,
  city: MapPin,
  village: Home,
  landmark: Landmark,
};

/** Legal parent types per node type — mirrors geo_places_hierarchy_chk. */
const LEGAL_PARENT: Record<string, string[]> = {
  region: ['continent'],
  country: ['continent', 'region'],
  city: ['country'],
  village: ['city'],
  landmark: ['city', 'village'],
};

const EDITOR_LINK: Record<string, string> = {
  country: '/admin/content/countries',
  city: '/admin/content/cities',
  village: '/admin/villages',
};

const PUBLIC_HREF: Record<string, (slug: string) => string> = {
  country: (slug) => `/country/${slug}`,
  city: (slug) => `/city/${slug}`,
  village: (slug) => `/villages/${slug}`,
  landmark: (slug) => `/place/${slug}`,
};

function NodeRow({
  node,
  depth,
  selected,
  onSelect,
}: {
  node: GeoNode;
  depth: number;
  selected: GeoNode | null;
  onSelect: (n: GeoNode) => void;
}) {
  const [open, setOpen] = useState(false);
  const Icon = TYPE_ICON[node.place_type] ?? MapPin;
  const isSelected = selected?.id === node.id;

  return (
    <div>
      <div
        className={`flex min-h-11 items-center gap-2 rounded-element px-2 py-1 ${
          isSelected ? 'bg-accent' : 'hover:bg-muted'
        }`}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        <button
          type="button"
          aria-label={open ? 'Collapse' : 'Expand'}
          className="flex h-6 w-6 shrink-0 items-center justify-center"
          onClick={() => setOpen((o) => !o)}
          disabled={node.child_count === 0}
        >
          {node.child_count > 0 ? (
            open ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )
          ) : (
            <span className="h-4 w-4" />
          )}
        </button>
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={() => onSelect(node)}
        >
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate">{node.name}</span>
          {node.safety_gated && <Lock className="h-3 w-3 shrink-0" aria-label="Safety-gated" />}
          {node.duplicate_of_id && (
            <Badge variant="outline" className="shrink-0">
              dup
            </Badge>
          )}
          <span className="ml-auto shrink-0 text-2xs uppercase tracking-wide text-muted-foreground">
            {node.child_count > 0 && `${node.child_count} · `}
            {node.place_type}
          </span>
        </button>
      </div>
      {open && (
        <NodeChildren parentId={node.id} depth={depth + 1} selected={selected} onSelect={onSelect} />
      )}
    </div>
  );
}

function NodeChildren({
  parentId,
  depth,
  selected,
  onSelect,
}: {
  parentId: string | null;
  depth: number;
  selected: GeoNode | null;
  onSelect: (n: GeoNode) => void;
}) {
  const { data, isLoading } = useGeoChildren(parentId);
  if (isLoading) {
    return (
      <div
        className="py-2 text-13 text-muted-foreground"
        style={{ paddingLeft: `${depth * 20 + 16}px` }}
      >
        Loading…
      </div>
    );
  }
  return (
    <div>
      {(data ?? []).map((n) => (
        <NodeRow key={n.id} node={n} depth={depth} selected={selected} onSelect={onSelect} />
      ))}
    </div>
  );
}

function MoveDialog({ node, open, onClose }: { node: GeoNode; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const legalTypes = LEGAL_PARENT[node.place_type] ?? [];
  const { data: candidates } = useGeoMoveCandidates(legalTypes, search, open);
  const move = useGeoMoveNode(node.id);

  const handleMove = (newParentId: string) => {
    move.mutate(newParentId, {
      onSuccess: (data) => {
        const fixed = data.repaired
          ? Object.entries(data.repaired)
              .filter(([, n]) => n > 0)
              .map(([k, n]) => `${n} ${k}`)
              .join(', ')
          : '';
        toast({
          title: `Moved ${node.name}`,
          description: fixed ? `Also repaired: ${fixed}` : undefined,
        });
        onClose();
      },
      onError: (e: Error) =>
        toast({ title: 'Move failed', description: e.message, variant: 'destructive' }),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move “{node.name}”</DialogTitle>
        </DialogHeader>
        <p className="text-13 text-muted-foreground">
          New parent must be a {legalTypes.join(' or ')}. Descendants and located entities are
          re-derived automatically.
        </p>
        <Input
          placeholder={`Search ${legalTypes.join('/')}…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
        <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
          {(candidates ?? []).map((c) => (
            <Button
              key={c.id}
              variant="ghost"
              className="justify-start"
              disabled={move.isPending}
              onClick={() => handleMove(c.id)}
            >
              <span className="mr-2 text-2xs uppercase tracking-wide text-muted-foreground">
                {c.place_type}
              </span>
              {c.name}
            </Button>
          ))}
          {search.length >= 2 && candidates?.length === 0 && (
            <p className="py-2 text-13 text-muted-foreground">No matches.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const EMPTY_FORM: LandmarkFormValues = {
  name: '',
  landmark_kind: 'landmark',
  description: '',
  address: '',
  website: '',
  accessibility_notes: '',
};

function LandmarkDialog({
  parent,
  landmark,
  open,
  onClose,
}: {
  /** City/village node to create under (create mode). */
  parent: GeoNode | null;
  /** Existing landmark node (edit mode). */
  landmark: GeoNode | null;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<LandmarkFormValues>(EMPTY_FORM);

  const { data: existing } = useLandmarkProfile(landmark?.id, open);
  const { data: spineRow } = useLandmarkSpine(landmark?.id, open);
  const save = useSaveLandmark({
    landmarkId: landmark?.id ?? null,
    parent: parent ? { id: parent.id, name: parent.name } : null,
  });

  // Hydrate the form when the edit target loads; reset for create mode.
  const loadedKey = `${existing?.place_id ?? ''}:${spineRow?.id ?? ''}:${open}`;
  useEffect(() => {
    if (landmark && existing && spineRow) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- form hydrates from two async queries; sync direction is external → local.
      setForm({
        name: spineRow.name ?? '',
        landmark_kind: existing.landmark_kind ?? 'landmark',
        description: spineRow.description ?? '',
        address: existing.address ?? '',
        website: existing.website ?? '',
        accessibility_notes: existing.accessibility_notes ?? '',
      });
    } else if (!landmark) {
      setForm(EMPTY_FORM);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedKey]);

  const handleSave = () => {
    save.mutate(form, {
      onSuccess: () => {
        toast({ title: landmark ? 'Landmark updated' : 'Landmark created' });
        onClose();
      },
      onError: (e: Error) =>
        toast({ title: 'Save failed', description: e.message, variant: 'destructive' }),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {landmark ? `Edit “${landmark.name}”` : `New place in ${parent?.name ?? ''}`}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-[1fr_auto] gap-4">
            <div>
              <Label htmlFor="lm-name">Name</Label>
              <Input
                id="lm-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="lm-kind">Kind</Label>
              <Select
                value={form.landmark_kind}
                onValueChange={(v) => setForm({ ...form, landmark_kind: v })}
              >
                <SelectTrigger id="lm-kind" className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANDMARK_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="lm-desc">Description</Label>
            <Textarea
              id="lm-desc"
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="lm-address">Address</Label>
            <Input
              id="lm-address"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="lm-website">Website</Label>
            <Input
              id="lm-website"
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="lm-access">Accessibility notes</Label>
            <Textarea
              id="lm-access"
              rows={2}
              value={form.accessibility_notes}
              onChange={(e) => setForm({ ...form, accessibility_notes: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={save.isPending}>
            {landmark ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailPanel({
  node,
  onMove,
  onAddLandmark,
  onEditLandmark,
}: {
  node: GeoNode;
  onMove: () => void;
  onAddLandmark: () => void;
  onEditLandmark: () => void;
}) {
  const { toast } = useToast();
  const isLandmark = node.place_type === 'landmark';
  const { state: review, approve } = useLandmarkReview(node.id, isLandmark);
  const remove = useDeleteLandmark();

  const canMove = node.place_type in LEGAL_PARENT;
  const editorLink = EDITOR_LINK[node.place_type];
  const publicHref = node.slug ? PUBLIC_HREF[node.place_type]?.(node.slug) : undefined;

  return (
    <div className="flex flex-col gap-4 rounded-container border border-border p-6">
      <div>
        <div className="text-2xs uppercase tracking-wide text-muted-foreground">
          {node.place_type}
        </div>
        <h2 className="text-title font-semibold">{node.name}</h2>
        {node.slug && <div className="text-13 text-muted-foreground">/{node.slug}</div>}
      </div>
      <dl className="grid grid-cols-2 gap-2 text-15">
        <dt className="text-muted-foreground">Children</dt>
        <dd>{node.child_count}</dd>
        <dt className="text-muted-foreground">Venues</dt>
        <dd>{node.venue_count}</dd>
        <dt className="text-muted-foreground">Events</dt>
        <dd>{node.event_count}</dd>
        <dt className="text-muted-foreground">Hotels</dt>
        <dd>{node.hotel_count}</dd>
      </dl>
      {node.safety_gated && (
        <p className="flex items-center gap-2 text-13 text-muted-foreground">
          <Lock className="h-3 w-3" aria-hidden /> Safety-gated: only visible to signed-in members.
        </p>
      )}
      {isLandmark && review.data?.needs_review && (
        <div className="rounded-element border border-border bg-muted p-4 text-13">
          Pending review — hidden from search and public pages until approved.
          <Button
            size="sm"
            className="mt-2 w-full"
            disabled={approve.isPending}
            onClick={() =>
              approve.mutate(undefined, {
                onSuccess: () => toast({ title: 'Approved — now public and searchable' }),
                onError: (e: Error) =>
                  toast({ title: 'Approve failed', description: e.message, variant: 'destructive' }),
              })
            }
          >
            Approve
          </Button>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {canMove && (
          <Button size="sm" variant="outline" onClick={onMove}>
            <Move className="mr-1 h-3 w-3" /> Move
          </Button>
        )}
        {(node.place_type === 'city' || node.place_type === 'village') && (
          <Button size="sm" variant="outline" onClick={onAddLandmark}>
            <Plus className="mr-1 h-3 w-3" /> Add place
          </Button>
        )}
        {isLandmark && (
          <>
            <Button size="sm" variant="outline" onClick={onEditLandmark}>
              Edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (window.confirm(`Delete ${node.name}? This cannot be undone.`)) {
                  remove.mutate(node.id, {
                    onSuccess: () => toast({ title: `Deleted ${node.name}` }),
                    onError: (e: Error) =>
                      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' }),
                  });
                }
              }}
            >
              <Trash2 className="mr-1 h-3 w-3" /> Delete
            </Button>
          </>
        )}
        {editorLink && (
          <Button size="sm" variant="outline" asChild>
            <Link to={editorLink}>
              <Building className="mr-1 h-3 w-3" /> Open editor
            </Link>
          </Button>
        )}
        {publicHref && (
          <Button size="sm" variant="ghost" asChild>
            <a href={publicHref} target="_blank" rel="noopener noreferrer">
              View public page
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}

function IntegrityTab() {
  const { data, isLoading } = useGeoIntegrityViolations();

  if (isLoading) return <p className="text-13 text-muted-foreground">Checking…</p>;
  if (!data || data.length === 0) {
    return (
      <p className="text-15 text-muted-foreground">
        No integrity violations. The tree is consistent.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-15">
        <thead>
          <tr className="border-b border-border text-left text-2xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-4">Violation</th>
            <th className="py-2 pr-4">Entity</th>
            <th className="py-2">Name</th>
          </tr>
        </thead>
        <tbody>
          {data.map((v) => (
            <tr key={`${v.violation}:${v.entity_id}`} className="border-b border-border/60">
              <td className="py-2 pr-4">{v.violation}</td>
              <td className="py-2 pr-4">{v.entity_type}</td>
              <td className="py-2">{v.entity_name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminGeography() {
  const [selected, setSelected] = useState<GeoNode | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [landmarkOpen, setLandmarkOpen] = useState(false);
  const [landmarkEdit, setLandmarkEdit] = useState(false);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <AdminPageHeader
        title="Geography"
        subtitle="The full geo tree — continents to landmarks. Move nodes, add parks/beaches/landmarks, review integrity."
      />
      <Tabs defaultValue="tree">
        <TabsList>
          <TabsTrigger value="tree">Tree</TabsTrigger>
          <TabsTrigger value="integrity">Integrity</TabsTrigger>
        </TabsList>
        <TabsContent value="tree">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[3fr_2fr]">
            <div className="max-h-[70vh] overflow-y-auto rounded-container border border-border p-2">
              <NodeChildren parentId={null} depth={0} selected={selected} onSelect={setSelected} />
            </div>
            <div>
              {selected ? (
                <DetailPanel
                  node={selected}
                  onMove={() => setMoveOpen(true)}
                  onAddLandmark={() => {
                    setLandmarkEdit(false);
                    setLandmarkOpen(true);
                  }}
                  onEditLandmark={() => {
                    setLandmarkEdit(true);
                    setLandmarkOpen(true);
                  }}
                />
              ) : (
                <p className="p-6 text-15 text-muted-foreground">Select a node to inspect it.</p>
              )}
            </div>
          </div>
        </TabsContent>
        <TabsContent value="integrity">
          <IntegrityTab />
        </TabsContent>
      </Tabs>
      {selected && <MoveDialog node={selected} open={moveOpen} onClose={() => setMoveOpen(false)} />}
      {selected && (
        <LandmarkDialog
          parent={landmarkEdit ? null : selected}
          landmark={landmarkEdit ? selected : null}
          open={landmarkOpen}
          onClose={() => setLandmarkOpen(false)}
        />
      )}
    </div>
  );
}
