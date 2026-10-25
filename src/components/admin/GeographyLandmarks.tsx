import { FieldRenderer } from '@/components/cms/fields/FieldRenderer';
import { useEffect, useState } from 'react';
import { Plus, Pencil, ExternalLink } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AdminTextSkeleton } from '@/components/admin/primitives/AdminLoading';
import { useToast } from '@/hooks/use-toast';
import { LANDMARK_KINDS } from '@/lib/landmarkKinds';
import {
  useGeoChildren,
  useLandmarkProfile,
  useLandmarkSpine,
  useSaveLandmark,
  type GeoNode,
  type LandmarkFormValues,
} from '@/hooks/useGeoPlaces';

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
            <FieldRenderer
              field={{ name: 'lm-desc', label: 'Description', type: 'textarea', group: 'basic' }}
              value={form.description}
              onChange={(next) => setForm({ ...form, description: String(next ?? '') })}
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

export function GeographyLandmarks({ record }: { record: GeoNode }) {
  const children = useGeoChildren(record.id);
  const [editing, setEditing] = useState<GeoNode | null>(null);
  const [creating, setCreating] = useState(false);
  const landmarks =
    children.data?.filter((row) => row.place_type === 'landmark' && !row.duplicate_of_id) ?? [];
  return (
    <section className="flex flex-col gap-2 border-t pt-4" aria-label="Associated landmarks">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-15 font-semibold">Associated landmarks</h3>
        <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
          <Plus size={14} className="mr-2" />
          Add place
        </Button>
      </div>
      {children.isLoading && <AdminTextSkeleton lines={2} />}
      {children.isError && (
        <p role="alert">
          Could not load landmarks.{' '}
          <Button variant="ghost" onClick={() => void children.refetch()}>
            Retry
          </Button>
        </p>
      )}
      <ul>
        {landmarks.map((row) => (
          <li
            key={row.id}
            className="flex items-center justify-between gap-2 border-b py-2 text-13"
          >
            <span>{row.name}</span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEditing(row)}>
                <Pencil size={14} className="mr-2" />
                Edit
              </Button>
              {row.slug && (
                <a
                  href={`/place/${row.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`View ${row.name}`}
                  className="flex h-11 w-11 items-center justify-center"
                >
                  <ExternalLink size={16} />
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
      {(creating || editing) && (
        <LandmarkDialog
          parent={creating ? record : null}
          landmark={editing}
          open
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}
