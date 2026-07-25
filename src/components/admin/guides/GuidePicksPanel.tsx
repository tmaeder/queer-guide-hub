import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, Sparkles, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { untypedFrom, untypedSupabase } from '@/integrations/supabase/untyped';
import type { GuideEntityType } from '@/lib/guidePickAdapters';
import type { PickTier } from '@/hooks/useGuides';

const ENTITY_TABLES: Record<string, { table: string; nameCol: string }> = {
  venue: { table: 'venues', nameCol: 'name' },
  event: { table: 'events', nameCol: 'title' },
  marketplace: { table: 'marketplace_listings', nameCol: 'title' },
  city: { table: 'cities', nameCol: 'name' },
  country: { table: 'countries', nameCol: 'name' },
  queer_village: { table: 'queer_villages', nameCol: 'name' },
};

const TIERS: Array<{ value: PickTier | 'none'; label: string }> = [
  { value: 'none', label: 'No tier (list item)' },
  { value: 'top', label: 'Our pick' },
  { value: 'also_great', label: 'Also great' },
  { value: 'upgrade', label: 'Worth the upgrade' },
  { value: 'budget', label: 'Budget pick' },
  { value: 'avoid', label: 'Skip this one' },
];

interface PickRow {
  id: string;
  entity_type: GuideEntityType;
  entity_id: string;
  tier: PickTier | null;
  rationale_md: string | null;
  pros: string[];
  cons: string[];
  position: number;
  is_orphaned: boolean;
  resolved_name?: string;
}

/**
 * Relation editor for guide_picks — extraPanels accordion item in the guides
 * CMS editor. Polymorphic entity search, tier select, rationale, reorder,
 * plus the "AI draft" trigger (guide-draft edge fn hydrates picks context).
 */
export function GuidePicksPanel({ guideId }: { guideId: string }) {
  const qc = useQueryClient();
  const [type, setType] = useState<GuideEntityType>('venue');
  const [search, setSearch] = useState('');
  const [tier, setTier] = useState<PickTier | 'none'>('top');
  const [drafting, setDrafting] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-guide-picks', guideId] });

  const { data: picks } = useQuery({
    queryKey: ['admin-guide-picks', guideId],
    queryFn: async (): Promise<PickRow[]> => {
      const { data, error } = await untypedFrom('guide_picks')
        .select('id, entity_type, entity_id, tier, rationale_md, pros, cons, position, is_orphaned')
        .eq('guide_id', guideId)
        .order('position');
      if (error) throw error;
      const rows = (data ?? []) as PickRow[];
      for (const t of Object.keys(ENTITY_TABLES)) {
        const ids = rows.filter((r) => r.entity_type === t).map((r) => r.entity_id);
        if (!ids.length) continue;
        const { table, nameCol } = ENTITY_TABLES[t];
        const { data: named } = await untypedFrom(table).select(`id, ${nameCol}`).in('id', ids);
        const byId = new Map(
          ((named ?? []) as Array<Record<string, string>>).map((n) => [n.id, n[nameCol]]),
        );
        for (const r of rows) if (r.entity_type === t) r.resolved_name = byId.get(r.entity_id);
      }
      return rows;
    },
  });

  const { data: suggestions } = useQuery({
    queryKey: ['admin-guide-pick-search', type, search],
    enabled: search.trim().length >= 2,
    queryFn: async () => {
      const { table, nameCol } = ENTITY_TABLES[type];
      const { data, error } = await untypedFrom(table)
        .select(`id, ${nameCol}`)
        .ilike(nameCol, `%${search.trim()}%`)
        .limit(8);
      if (error) throw error;
      return (data ?? []) as Array<Record<string, string>>;
    },
  });

  const addPick = useMutation({
    mutationFn: async (entityId: string) => {
      const { error } = await untypedFrom('guide_picks').insert({
        guide_id: guideId,
        entity_type: type,
        entity_id: entityId,
        tier: tier === 'none' ? null : tier,
        position: picks?.length ?? 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setSearch('');
      invalidate();
    },
    onError: (e: Error) =>
      toast({ title: 'Add pick failed', description: e.message, variant: 'destructive' }),
  });

  const updatePick = useMutation({
    mutationFn: async ({ id, ...patch }: Partial<PickRow> & { id: string }) => {
      const { error } = await untypedFrom('guide_picks').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) =>
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' }),
  });

  const removePick = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await untypedFrom('guide_picks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) =>
      toast({ title: 'Remove failed', description: e.message, variant: 'destructive' }),
  });

  const move = (idx: number, dir: -1 | 1) => {
    if (!picks) return;
    const other = idx + dir;
    if (other < 0 || other >= picks.length) return;
    updatePick.mutate({ id: picks[idx].id, position: picks[other].position });
    updatePick.mutate({ id: picks[other].id, position: picks[idx].position });
  };

  const draftWithAi = async () => {
    setDrafting(true);
    try {
      const { data, error } = await untypedSupabase.functions.invoke('guide-draft', {
        body: { guide_id: guideId },
      });
      if (error) throw error;
      const d = data as { drafted?: number } | null;
      toast({
        title: 'Draft ready',
        description: `AI drafted intro + ${d?.drafted ?? 0} pick rationales. Review before publishing.`,
      });
      invalidate();
      qc.invalidateQueries({ queryKey: ['cms-content'] });
    } catch (e) {
      toast({ title: 'Draft failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setDrafting(false);
    }
  };

  const nameCol = ENTITY_TABLES[type].nameCol;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={draftWithAi} disabled={drafting}>
          <Sparkles size={14} className="mr-2" aria-hidden />
          {drafting ? 'Drafting…' : 'AI draft rationales'}
        </Button>
      </div>

      <ul className="flex flex-col gap-4">
        {(picks ?? []).map((p, idx) => (
          <li key={p.id} className="rounded-element border border-border p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline">{p.entity_type}</Badge>
              {p.is_orphaned && <Badge variant="destructive">orphaned</Badge>}
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {p.resolved_name ?? p.entity_id}
              </span>
              <Select
                value={p.tier ?? 'none'}
                onValueChange={(v) =>
                  updatePick.mutate({ id: p.id, tier: v === 'none' ? null : (v as PickTier) })
                }
              >
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIERS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" onClick={() => move(idx, -1)} aria-label="Move up">
                <ArrowUp size={14} />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => move(idx, 1)} aria-label="Move down">
                <ArrowDown size={14} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removePick.mutate(p.id)}
                aria-label={`Remove ${p.resolved_name ?? p.entity_id}`}
              >
                <Trash2 size={14} />
              </Button>
            </div>
            <Textarea
              defaultValue={p.rationale_md ?? ''}
              placeholder="Why this pick? (markdown)"
              rows={2}
              onBlur={(e) => {
                const v = e.target.value;
                if (v !== (p.rationale_md ?? '')) {
                  updatePick.mutate({ id: p.id, rationale_md: v || null });
                }
              }}
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                defaultValue={p.pros.join('; ')}
                placeholder="Pros (separate with ;)"
                aria-label="Pros"
                onBlur={(e) => {
                  const pros = e.target.value.split(';').map((s) => s.trim()).filter(Boolean);
                  if (pros.join(';') !== p.pros.join(';')) updatePick.mutate({ id: p.id, pros });
                }}
              />
              <Input
                defaultValue={p.cons.join('; ')}
                placeholder="Cons (separate with ;)"
                aria-label="Cons"
                onBlur={(e) => {
                  const cons = e.target.value.split(';').map((s) => s.trim()).filter(Boolean);
                  if (cons.join(';') !== p.cons.join(';')) updatePick.mutate({ id: p.id, cons });
                }}
              />
            </div>
          </li>
        ))}
        {!picks?.length && (
          <li className="text-sm italic text-muted-foreground">No picks yet.</li>
        )}
      </ul>

      <div className="flex flex-col gap-2 rounded-element border border-border p-2">
        <div className="flex items-center gap-2">
          <Select value={type} onValueChange={(v) => setType(v as GuideEntityType)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.keys(ENTITY_TABLES).map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={tier} onValueChange={(v) => setTier(v as PickTier | 'none')}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIERS.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search entity…"
            aria-label="Search entity to add as pick"
            className="flex-1"
          />
        </div>
        {!!suggestions?.length && (
          <ul className="flex flex-col">
            {suggestions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => addPick.mutate(s.id)}
                  disabled={addPick.isPending}
                  className="flex w-full items-center gap-2 rounded-element px-2 py-1 text-left text-sm hover:bg-muted"
                >
                  <Plus size={14} aria-hidden />
                  <span className="truncate">{s[nameCol]}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
