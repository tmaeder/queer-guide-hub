import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Bookmark, Plus, X } from 'lucide-react';
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
        <Button variant="outline" size="sm" aria-label="Saved searches">
          <Bookmark style={{ width: 14, height: 14, marginRight: 6 }} aria-hidden="true" />
          Saved searches
          {searches.length > 0 && (
            <span className="ml-1.5 text-[11px] rounded-full bg-muted px-1.5 py-0 leading-tight">
              {searches.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="flex flex-col gap-3">
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
                <Plus style={{ width: 14, height: 14 }} aria-hidden="true" />
              </Button>
            </div>
          </div>

          {searches.length > 0 && (
            <div className="border-t border-border pt-3">
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
                      className="flex-1 text-left text-sm px-2 py-1.5 rounded hover:bg-muted truncate"
                      title={s.query}
                    >
                      {s.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(s.id)}
                      aria-label={`Delete saved search ${s.name}`}
                      className="p-1 rounded hover:bg-muted text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                    >
                      <X style={{ width: 12, height: 12 }} aria-hidden="true" />
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
