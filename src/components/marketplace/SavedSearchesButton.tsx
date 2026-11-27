import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Bookmark, Plus, X } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useSavedSearches } from '@/hooks/useSavedSearches';

export function SavedSearchesButton() {
  const { searches, save, remove } = useSavedSearches();
  const location = useLocation();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [open, setOpen] = useState(false);

  const currentQuery = location.search;
  const hasFilters = currentQuery.length > 1;

  const handleSave = () => {
    save(name, currentQuery);
    setName('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Saved searches"
          title="Saved searches"
          className="relative grid size-11 shrink-0 place-items-center rounded-element bg-card shadow-soft hover:bg-foreground hover:text-background"
        >
          <Bookmark size={18} aria-hidden="true" />
          {searches.length > 0 && (
            <span className="absolute -end-1 -top-1 grid min-w-5 place-items-center rounded-full border border-track-ring bg-track-pink px-1 text-3xs font-bold text-track-ring">
              {searches.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-sm font-semibold mb-2">Save current filters</p>
            <div className="flex gap-2">
              <Input
                placeholder={hasFilters ? 'Name this search…' : 'Apply filters first'}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && hasFilters) handleSave();
                }}
                disabled={!hasFilters}
                className="h-9 text-sm"
              />
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!hasFilters || !name.trim()}
                aria-label="Save search"
              >
                <Plus size={14} aria-hidden="true" />
              </Button>
            </div>
          </div>

          {searches.length > 0 && (
            <div className="pt-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Saved</p>
              <ul className="flex flex-col gap-1 max-h-[260px] overflow-y-auto">
                {searches.map((s) => (
                  <li key={s.id} className="flex items-center gap-1 group">
                    <button
                      type="button"
                      onClick={() => {
                        navigate({ search: s.query });
                        setOpen(false);
                      }}
                      className="flex-1 text-left text-sm px-2 py-1.5 rounded-element hover:bg-muted truncate"
                      title={s.query}
                    >
                      {s.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(s.id)}
                      aria-label={`Delete saved search ${s.name}`}
                      className="p-1 rounded-element hover:bg-muted text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                    >
                      <X size={12} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
