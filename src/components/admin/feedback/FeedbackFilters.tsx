import { useEffect, useRef, useState } from 'react';
import { Search, X, SlidersHorizontal } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
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
  const [localQ, setLocalQ] = useState(state.q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const filterCount = activeFilterCount - (state.q ? 1 : 0) - (state.withClaude ? 1 : 0);

  return (
    <div className="flex items-center gap-2">
      <div className="relative min-w-[200px] flex-[0_1_320px] max-sm:flex-[1_1_100%]">
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

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="relative gap-1.5 h-9">
            <SlidersHorizontal size={14} />
            Filters
            {filterCount > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full bg-primary text-primary-foreground text-[0.6rem] font-bold flex items-center justify-center"
              >
                {filterCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[280px] p-3 flex flex-col gap-3">
          <div>
            <Label className="text-xs font-semibold mb-1 block">Category</Label>
            <Select value={state.category ?? '__all__'} onValueChange={(v) => update({ category: v === '__all__' ? null : v })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All categories</SelectItem>
                {feedbackCategories.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs font-semibold mb-1 block">Status</Label>
            <Select value={state.status ?? '__all__'} onValueChange={(v) => update({ status: v === '__all__' ? null : v })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All statuses</SelectItem>
                {kanbanColumns.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs font-semibold mb-1 block">Priority</Label>
            <Select
              value={state.priority == null ? '__all__' : String(state.priority)}
              onValueChange={(v) => update({ priority: v === '__all__' ? null : Number(v) })}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All priorities</SelectItem>
                {priorities.map((p) => (
                  <SelectItem key={p.value} value={String(p.value)}>{p.short} · {p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs font-semibold mb-1 block">Assignee</Label>
            <Select value={state.assignee ?? '__any__'} onValueChange={(v) => update({ assignee: v === '__any__' ? null : v })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
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
          </div>

          {labels.length > 0 && (
            <div>
              <Label className="text-xs font-semibold mb-1 block">Label</Label>
              <Select value={state.label ?? '__any__'} onValueChange={(v) => update({ label: v === '__any__' ? null : v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__any__">Any label</SelectItem>
                  {labels.map((l) => (
                    <SelectItem key={l} value={l}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border">
            <div className="flex items-center gap-1.5">
              <Switch
                id="filter-screenshot"
                checked={state.hasScreenshot}
                onCheckedChange={(v) => update({ hasScreenshot: v })}
              />
              <Label htmlFor="filter-screenshot" className="text-xs cursor-pointer">Screenshot</Label>
            </div>
            <div className="flex items-center gap-1.5">
              <Switch
                id="filter-errors"
                checked={state.hasErrors}
                onCheckedChange={(v) => update({ hasErrors: v })}
              />
              <Label htmlFor="filter-errors" className="text-xs cursor-pointer">Errors</Label>
            </div>
          </div>

          {filterCount > 0 && (
            <Button size="sm" variant="ghost" onClick={clearFilters} className="w-full mt-1">
              Reset filters
            </Button>
          )}
        </PopoverContent>
      </Popover>

      {activeFilterCount > 0 && (
        <Button size="sm" variant="ghost" onClick={clearFilters} className="text-xs">
          Reset
        </Button>
      )}
    </div>
  );
}
