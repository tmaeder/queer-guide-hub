import { useState } from 'react';
import { toast } from 'sonner';
import {
  useTagSources,
  LEGAL_SOURCE_TYPES,
  INSTRUMENT_STATUSES,
  type TagSource,
  type TagSourceInput,
} from '@/hooks/useTagSources';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { AdminEmpty } from '@/components/admin/primitives/AdminEmpty';
import { AdminTextSkeleton } from '@/components/admin/primitives/AdminLoading';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, X, ExternalLink } from 'lucide-react';

/**
 * Attach the law a glossary tag is about.
 *
 * Only for tags that ARE a named instrument. A tag naming a CLASS of law
 * (`marriage-equality` is 38 national statutes) is mapped to a rights topic in
 * src/lib/rights/tagRightTopics.ts instead — deliberately a code change, not an
 * editor one.
 *
 * Nothing published here may be a guess. `is_public` is gated in the database by
 * `tag_sources_public_requires_citation`, so ticking it on an incomplete row
 * fails at Postgres and surfaces as the toast below. That is the intended UX.
 */

const TYPE_LABEL: Record<string, string> = {
  statute: 'Statute',
  treaty: 'Treaty',
  case_law: 'Case law',
  constitution: 'Constitution',
  resolution: 'Resolution / declaration',
};

const STATUS_LABEL: Record<string, string> = {
  in_force: 'In force',
  repealed: 'Repealed',
  superseded: 'Superseded',
  partially_invalidated: 'In force, partly struck down',
};

/** Radix Select has no empty-string value, so NULL needs a sentinel. */
const NA = '__none__';

/** `adopted_year` is a string while typing; coerced to a number on save. */
type Draft = Omit<TagSourceInput, 'adopted_year'> & { adopted_year: string };

const EMPTY: Draft = {
  source_type: 'statute',
  official_title: '',
  jurisdiction: '',
  source_url: '',
  claim_summary: '',
  instrument_status: 'in_force',
  adopted_year: '',
  is_public: false,
};

export function TagLegalSourcesSection({ tagId }: { tagId: string }) {
  const { sources, isLoading, createSource, updateSource, deleteSource } = useTagSources(tagId);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [open, setOpen] = useState(false);

  // The backfill rows (wikipedia/wikidata) are not citations and are not editable
  // here — showing them would bury the two or three rows that matter.
  const citations = sources.filter((s) =>
    (LEGAL_SOURCE_TYPES as readonly string[]).includes(s.source_type),
  );

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  // Postgres owns the real rule; this only decides whether the button is enabled.
  const publishable = Boolean(
    draft.official_title?.trim() && draft.source_url?.trim() && draft.jurisdiction?.trim(),
  );

  const fail = (e: unknown) => {
    const msg = String((e as { message?: string })?.message ?? e);
    toast.error(
      msg.includes('tag_sources_public_requires_citation')
        ? 'Cannot publish: a public citation needs an official title, a jurisdiction and a URL.'
        : msg.includes('tag_sources_jurisdiction_shape')
          ? 'Jurisdiction must be a 2-letter country code (e.g. UG) or INT.'
          : `Failed to save: ${msg}`,
    );
  };

  const handleAdd = async () => {
    const parsed = draft.adopted_year.trim() ? Number(draft.adopted_year) : NaN;
    const year = Number.isFinite(parsed) ? parsed : null;
    try {
      await createSource.mutateAsync({
        source_type: draft.source_type,
        official_title: draft.official_title?.trim() || null,
        jurisdiction: draft.jurisdiction?.trim().toUpperCase() || null,
        source_url: draft.source_url?.trim() || null,
        claim_summary: draft.claim_summary?.trim() || null,
        instrument_status: draft.instrument_status,
        adopted_year: year,
        is_public: draft.is_public,
      });
      setDraft(EMPTY);
      setOpen(false);
      toast.success('Legal source added');
    } catch (e) {
      fail(e);
    }
  };

  const togglePublic = async (s: TagSource) => {
    try {
      await updateSource.mutateAsync({ id: s.id, is_public: !s.is_public });
    } catch (e) {
      fail(e);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteSource.mutateAsync(id);
    } catch (e) {
      fail(e);
    }
  };

  return (
    <div>
      <Label>Source of law</Label>
      {isLoading ? (
        <AdminTextSkeleton lines={2} />
      ) : (
        <>
          {citations.length === 0 && (
            <AdminEmpty noun="legal sources" variant="inline" className="mb-2 block text-xs" />
          )}

          {citations.map((s) => (
            <div key={s.id} className="mb-2 rounded-element border p-2 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium">{s.official_title || '(no title)'}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <Badge variant="outline">{TYPE_LABEL[s.source_type] ?? s.source_type}</Badge>
                    {s.jurisdiction && <Badge variant="secondary">{s.jurisdiction}</Badge>}
                    {s.adopted_year != null && <Badge variant="outline">{s.adopted_year}</Badge>}
                    {s.instrument_status && (
                      <Badge variant="outline">
                        {STATUS_LABEL[s.instrument_status] ?? s.instrument_status}
                      </Badge>
                    )}
                    {s.source_url && (
                      <a
                        href={s.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1"
                      >
                        <ExternalLink size={11} /> open
                      </a>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Remove legal source"
                  onClick={() => handleDelete(s.id)}
                  className="shrink-0 opacity-60"
                >
                  <X size={12} />
                </button>
              </div>
              {/* Radix renders a button, not an input, so the association has to
                  be explicit — nesting does not satisfy jsx-a11y. */}
              <div className="mt-2 flex items-center gap-2">
                <Checkbox
                  id={`ts-public-${s.id}`}
                  checked={s.is_public}
                  onCheckedChange={() => togglePublic(s)}
                />
                <Label htmlFor={`ts-public-${s.id}`} className="font-normal">
                  Show on the public glossary page
                </Label>
              </div>
            </div>
          ))}

          {!open ? (
            <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
              <Plus size={14} /> Add legal source
            </Button>
          ) : (
            <div className="space-y-2 rounded-element border p-2">
              <Input
                placeholder="Official title, e.g. Anti-Homosexuality Act, 2023"
                value={draft.official_title ?? ''}
                onChange={(e) => set({ official_title: e.target.value })}
              />
              <div className="flex gap-2">
                <Select
                  value={draft.source_type}
                  onValueChange={(v) => set({ source_type: v as TagSourceInput['source_type'] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEGAL_SOURCE_TYPES.map((v) => (
                      <SelectItem key={v} value={v}>
                        {TYPE_LABEL[v]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="UG / INT"
                  value={draft.jurisdiction ?? ''}
                  onChange={(e) => set({ jurisdiction: e.target.value })}
                  style={{ width: 100 }}
                />
                <Input
                  placeholder="Year"
                  inputMode="numeric"
                  value={draft.adopted_year}
                  onChange={(e) => set({ adopted_year: e.target.value })}
                  style={{ width: 90 }}
                />
              </div>
              <Select
                value={draft.instrument_status ?? NA}
                onValueChange={(v) => set({ instrument_status: v === NA ? null : v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INSTRUMENT_STATUSES.map((v) => (
                    <SelectItem key={v} value={v}>
                      {STATUS_LABEL[v]}
                    </SelectItem>
                  ))}
                  {/* A declaration or a GA resolution does not commence or lapse,
                      so "in force" would be an overstatement rather than a
                      default. */}
                  <SelectItem value={NA}>Not applicable</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="Official URL (gazette, OHCHR, legislation.gov.uk — not Wikipedia)"
                value={draft.source_url ?? ''}
                onChange={(e) => set({ source_url: e.target.value })}
              />
              <Input
                placeholder="One factual sentence"
                value={draft.claim_summary ?? ''}
                onChange={(e) => set({ claim_summary: e.target.value })}
              />
              <div className="flex items-center gap-2 text-xs">
                <Checkbox
                  id="ts-public-new"
                  checked={Boolean(draft.is_public)}
                  disabled={!publishable}
                  onCheckedChange={(v) => set({ is_public: Boolean(v) })}
                />
                <Label htmlFor="ts-public-new" className="font-normal">
                  Show on the public glossary page
                  {!publishable && ' — needs a title, jurisdiction and URL first'}
                </Label>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleAdd}
                  disabled={!draft.official_title?.trim() || createSource.isPending}
                >
                  Save
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setDraft(EMPTY);
                    setOpen(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default TagLegalSourcesSection;
