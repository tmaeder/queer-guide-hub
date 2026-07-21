import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { untypedFrom } from '@/integrations/supabase/untyped';

type LinkEntityType = 'personality' | 'event' | 'venue' | 'news' | 'organization';

const ENTITY_TABLES: Record<LinkEntityType, { table: string; nameCol: string }> = {
  personality: { table: 'personalities', nameCol: 'name' },
  event: { table: 'events', nameCol: 'title' },
  venue: { table: 'venues', nameCol: 'name' },
  news: { table: 'news_articles', nameCol: 'title' },
  organization: { table: 'organizations', nameCol: 'name' },
};

interface LinkRow {
  id: string;
  entity_type: LinkEntityType;
  entity_id: string;
  role: string | null;
  sort_order: number;
  resolved_name?: string;
}

/**
 * Relation editor for milestone_links (polymorphic junction) — rendered as an
 * extraPanels accordion item in AdminFullEditSheet. Owns its own fetch +
 * mutations; the per-field save flow of the sheet is untouched.
 */
export function MilestoneLinksPanel({ milestoneId }: { milestoneId: string }) {
  const qc = useQueryClient();
  const [type, setType] = useState<LinkEntityType>('personality');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');

  const { data: links } = useQuery({
    queryKey: ['milestone-links', milestoneId],
    queryFn: async (): Promise<LinkRow[]> => {
      const { data, error } = await untypedFrom('milestone_links')
        .select('id, entity_type, entity_id, role, sort_order')
        .eq('milestone_id', milestoneId)
        .order('sort_order');
      if (error) throw error;
      const rows = (data ?? []) as LinkRow[];
      // Resolve display names per type (small N — sequential is fine).
      for (const t of Object.keys(ENTITY_TABLES) as LinkEntityType[]) {
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
    queryKey: ['milestone-link-search', type, search],
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

  const addLink = useMutation({
    mutationFn: async (entityId: string) => {
      const { error } = await untypedFrom('milestone_links').insert({
        milestone_id: milestoneId,
        entity_type: type,
        entity_id: entityId,
        role: role.trim() || null,
        sort_order: links?.length ?? 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setSearch('');
      setRole('');
      qc.invalidateQueries({ queryKey: ['milestone-links', milestoneId] });
    },
    onError: (e: Error) => toast({ title: 'Link failed', description: e.message, variant: 'destructive' }),
  });

  const removeLink = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await untypedFrom('milestone_links').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['milestone-links', milestoneId] }),
    onError: (e: Error) => toast({ title: 'Unlink failed', description: e.message, variant: 'destructive' }),
  });

  const nameCol = ENTITY_TABLES[type].nameCol;

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {(links ?? []).map((l) => (
          <li key={l.id} className="flex items-center gap-2">
            <Badge variant="outline">{l.entity_type}</Badge>
            <span className="min-w-0 flex-1 truncate text-sm">
              {l.resolved_name ?? l.entity_id}
              {l.role ? <span className="text-muted-foreground"> — {l.role}</span> : null}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => removeLink.mutate(l.id)}
              aria-label={`Unlink ${l.resolved_name ?? l.entity_id}`}
            >
              <Trash2 size={14} />
            </Button>
          </li>
        ))}
        {!links?.length && (
          <li className="text-sm italic text-muted-foreground">No linked entities yet.</li>
        )}
      </ul>

      <div className="flex flex-col gap-2 rounded-element border border-border p-2">
        <div className="flex items-center gap-2">
          <Select value={type} onValueChange={(v) => setType(v as LinkEntityType)}>
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
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            aria-label="Search entity to link"
            className="flex-1"
          />
        </div>
        <Input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="Role (optional), e.g. Beteiligte am Aufstand"
          aria-label="Role"
        />
        {!!suggestions?.length && (
          <ul className="flex flex-col">
            {suggestions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => addLink.mutate(s.id)}
                  disabled={addLink.isPending}
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
