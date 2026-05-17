import { useState } from 'react';
import { Bookmark, BookmarkPlus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { useSavedSearches } from '@/hooks/useSavedSearches';

interface SavedSearchesMenuProps {
  /** Current `?…` query string (without the `?`). Empty string disables save. */
  currentQueryString: string;
  /** Optional suggested name (typically the search query). */
  suggestedName?: string;
  /** Load a saved query string — caller decides whether to navigate. */
  onLoad: (queryString: string) => void;
}

export function SavedSearchesMenu({
  currentQueryString,
  suggestedName,
  onLoad,
}: SavedSearchesMenuProps) {
  const { searches, save, remove } = useSavedSearches();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');

  const handleSave = () => {
    if (!currentQueryString) return;
    save(name.trim() || suggestedName?.trim() || 'Untitled', currentQueryString);
    setName('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          style={{ fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}
          aria-label="Saved searches"
        >
          <Bookmark style={{ width: 14, height: 14 }} />
          Saved
          {searches.length > 0 && (
            <span className="text-muted-foreground">({searches.length})</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" style={{ width: 320, padding: 12 }}>
        {currentQueryString && (
          <div className="flex flex-col" style={{ gap: 6, marginBottom: 12 }}>
            <label className="text-xs font-medium" htmlFor="qg-saved-name">
              Save this search
            </label>
            <div className="flex" style={{ gap: 6 }}>
              <Input
                id="qg-saved-name"
                placeholder={suggestedName || 'Name…'}
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ fontSize: '0.875rem', flex: 1 }}
              />
              <Button size="sm" onClick={handleSave} aria-label="Save">
                <BookmarkPlus style={{ width: 14, height: 14 }} />
              </Button>
            </div>
          </div>
        )}
        {searches.length === 0 ? (
          <p className="text-xs text-muted-foreground">No saved searches yet.</p>
        ) : (
          <ul className="flex flex-col" style={{ gap: 4, maxHeight: 280, overflowY: 'auto' }}>
            {searches.map((s) => (
              <li
                key={s.id}
                className="flex items-center"
                style={{ gap: 6 }}
              >
                <button
                  type="button"
                  className="flex-1 text-left"
                  style={{
                    background: 'transparent',
                    border: 0,
                    padding: '6px 8px',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  onClick={() => {
                    onLoad(s.query);
                    setOpen(false);
                  }}
                  title={s.query}
                >
                  {s.name}
                </button>
                <button
                  type="button"
                  aria-label={`Delete saved search ${s.name}`}
                  onClick={() => remove(s.id)}
                  style={{
                    background: 'transparent',
                    border: 0,
                    padding: 4,
                    cursor: 'pointer',
                    color: 'hsl(var(--muted-foreground))',
                  }}
                >
                  <Trash2 style={{ width: 14, height: 14 }} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
