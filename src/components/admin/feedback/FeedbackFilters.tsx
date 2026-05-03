import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { feedbackCategories } from '@/config/feedbackCategories';
import { kanbanColumns, priorities } from './constants';
import type { AdminProfile } from './types';
import type { FeedbackUrlState } from '@/hooks/useFeedbackUrlState';

interface Props {
  state: FeedbackUrlState;
  update: (patch: Partial<FeedbackUrlState>) => void;
  clearFilters: () => void;
  activeFilterCount: number;
  admins: AdminProfile[];
  labels: string[];
  searchInputRef?: React.RefObject<HTMLInputElement>;
}

export function FeedbackFilters({
  state,
  update,
  clearFilters,
  activeFilterCount,
  admins,
  labels,
  searchInputRef,
}: Props) {
  // Local debounced search — 300ms so URL + query don't fire per keystroke.
  const [localQ, setLocalQ] = useState(state.q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync if URL state changes externally (back/forward nav).
  useEffect(() => {
    setLocalQ(state.q);
  }, [state.q]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (localQ === state.q) return;
    debounceRef.current = setTimeout(() => update({ q: localQ }), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localQ]);

  const switchRow = (id: string, checked: boolean, onChange: (v: boolean) => void, label: string) => (
    <div className="flex items-center gap-1.5 ml-1">
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
      <Label htmlFor={id} className="text-xs">{label}</Label>
    </div>
  );

  return (
    <div className="flex gap-2 flex-wrap items-center mb-4">
      <div className="relative min-w-[260px] flex-[0_1_320px] max-sm:flex-[1_1_100%]">
        <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={searchInputRef}
          placeholder="Search title, description, URL…"
          value={localQ}
          onChange={(e) => setLocalQ(e.target.value)}
          className="pl-7 pr-7 h-9"
        />
        {localQ && (
          <button
            onClick={() => setLocalQ('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer bg-transparent border-0 p-0"
            aria-label="Clear search"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <Select value={state.category ?? '__all__'} onValueChange={(v) => update({ category: v === '__all__' ? null : v })}>
        <SelectTrigger className="min-w-[140px] h-9 w-auto"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All categories</SelectItem>
          {feedbackCategories.map((c) => (
            <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={state.status ?? '__all__'} onValueChange={(v) => update({ status: v === '__all__' ? null : v })}>
        <SelectTrigger className="min-w-[140px] h-9 w-auto"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All statuses</SelectItem>
          {kanbanColumns.map((s) => (
            <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={state.priority == null ? '__all__' : String(state.priority)}
        onValueChange={(v) => update({ priority: v === '__all__' ? null : Number(v) })}
      >
        <SelectTrigger className="min-w-[120px] h-9 w-auto"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All priorities</SelectItem>
          {priorities.map((p) => (
            <SelectItem key={p.value} value={String(p.value)}>{p.short} · {p.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={state.assignee ?? '__any__'} onValueChange={(v) => update({ assignee: v === '__any__' ? null : v })}>
        <SelectTrigger className="min-w-[160px] h-9 w-auto"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__any__">Any assignee</SelectItem>
          <SelectItem value="__unassigned__">Unassigned</SelectItem>
          {admins.map((a) => (
            <SelectItem key={a.user_id} value={a.user_id}>
              {a.display_name || a.user_id.slice(0, 8)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {labels.length > 0 && (
        <Select value={state.label ?? '__any__'} onValueChange={(v) => update({ label: v === '__any__' ? null : v })}>
          <SelectTrigger className="min-w-[140px] h-9 w-auto"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__any__">Any label</SelectItem>
            {labels.map((l) => (
              <SelectItem key={l} value={l}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {switchRow('hasScreenshot', state.hasScreenshot, (v) => update({ hasScreenshot: v }), 'Has screenshot')}
      {switchRow('hasErrors', state.hasErrors, (v) => update({ hasErrors: v }), 'Has errors')}
      {switchRow('withClaude', state.withClaude, (v) => update({ withClaude: v }), 'With Claude')}
      {state.tab === 'community' && (
        <>
          {switchRow('showSpam', state.showSpam, (v) => update({ showSpam: v }), 'Include spam')}
          {switchRow('showDuplicates', state.showDuplicates, (v) => update({ showDuplicates: v }), 'Include dups')}
        </>
      )}

      {activeFilterCount > 0 && (
        <Badge variant="outline" className="gap-1">
          {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'}
          <button onClick={clearFilters} aria-label="Clear filters" className="ml-1">
            <X size={12} />
          </button>
        </Badge>
      )}
      <Button size="sm" variant="ghost" onClick={clearFilters} disabled={activeFilterCount === 0}>
        Reset
      </Button>
    </div>
  );
}
