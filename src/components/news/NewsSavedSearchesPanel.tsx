import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Bookmark, Bell, BellOff, Trash2, BookOpen } from 'lucide-react';
import { useNewsSavedSearches, type SavedSearch } from '@/hooks/useNewsSavedSearches';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface NewsSavedSearchesPanelProps {
  currentQuery?: string;
  currentFilters?: Record<string, unknown>;
  onLoadSearch?: (query: string, filters: Record<string, unknown>) => void;
  onOpenHistory?: () => void;
}

export function NewsSavedSearchesPanel({
  currentQuery,
  currentFilters,
  onLoadSearch,
  onOpenHistory,
}: NewsSavedSearchesPanelProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { searches, save, isSaving, remove, toggleAlert } = useNewsSavedSearches();
  const [open, setOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [alertEnabled, setAlertEnabled] = useState(false);
  const [alertFrequency, setAlertFrequency] = useState<'daily' | 'weekly'>('daily');
  const [showSaveForm, setShowSaveForm] = useState(false);

  const hasActiveSearch = !!(currentQuery?.trim() || Object.keys(currentFilters ?? {}).length > 0);

  const handleSave = async () => {
    if (!saveName.trim()) return;
    try {
      await save({
        name: saveName.trim(),
        query: currentQuery || undefined,
        filters: currentFilters,
        alert_enabled: alertEnabled,
        alert_frequency: alertFrequency,
      });
      setSaveName('');
      setAlertEnabled(false);
      setShowSaveForm(false);
      toast({ title: 'Search saved' });
    } catch {
      toast({ title: 'Could not save search', variant: 'destructive' });
    }
  };

  const handleLoad = (s: SavedSearch) => {
    onLoadSearch?.(s.query ?? '', s.filters);
    setOpen(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await remove(id);
    } catch {
      toast({ title: 'Could not delete', variant: 'destructive' });
    }
  };

  const handleToggleAlert = async (s: SavedSearch) => {
    try {
      await toggleAlert({ id: s.id, enabled: !s.alert_enabled });
    } catch {
      toast({ title: 'Could not update alert', variant: 'destructive' });
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Saved searches" style={{ padding: '0 8px', height: 36 }}>
          <Bookmark size={16} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" style={{ width: 320, padding: 0 }}>
        <div className="p-4 flex flex-col gap-2">
          {!user && (
            <p className="text-sm text-muted-foreground text-center py-2">
              Sign in to save searches and set up alerts.
            </p>
          )}

          {user && (
            <>
              {/* Save current search */}
              {hasActiveSearch && !showSaveForm && (
                <Button
                  variant="outline"
                  size="sm"
                  style={{ width: '100%' }}
                  onClick={() => setShowSaveForm(true)}
                >
                  <Bookmark size={14} className="mr-2" />
                  Save this search
                </Button>
              )}

              {showSaveForm && (
                <div className="flex flex-col gap-2 border border-border rounded-element p-2">
                  <Input
                    placeholder="Name this search…"
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void handleSave()}
                    autoFocus
                  />
                  <div className="flex items-center justify-between">
                    <label htmlFor="alert-switch" className="text-xs text-muted-foreground flex items-center gap-2">
                      <Bell size={12} /> Email alerts
                    </label>
                    <Switch id="alert-switch" checked={alertEnabled} onCheckedChange={setAlertEnabled} />
                  </div>
                  {alertEnabled && (
                    <Select
                      value={alertFrequency}
                      onValueChange={(v) => setAlertFrequency(v as 'daily' | 'weekly')}
                    >
                      <SelectTrigger style={{ height: 28, fontSize: '0.75rem' }}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily digest</SelectItem>
                        <SelectItem value="weekly">Weekly digest</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      style={{ flex: 1 }}
                      onClick={() => void handleSave()}
                      disabled={!saveName.trim() || isSaving}
                    >
                      Save
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setShowSaveForm(false); setSaveName(''); }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {/* Saved searches list */}
              {searches.length > 0 && (
                <>
                  <Separator />
                  <p className="text-xs text-muted-foreground font-medium">Saved searches</p>
                  <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
                    {searches.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center gap-2 p-2 rounded-element hover:bg-muted group"
                      >
                        <button
                          type="button"
                          onClick={() => handleLoad(s)}
                          className="flex-1 min-w-0 text-left"
                        >
                          <p className="text-sm truncate">{s.name}</p>
                          {s.query && (
                            <p className="text-xs text-muted-foreground truncate">"{s.query}"</p>
                          )}
                          {s.alert_enabled && (
                            <Badge variant="secondary" style={{ fontSize: '0.65rem', padding: '0 4px', marginTop: 2 }}>
                              {s.alert_frequency} alert
                            </Badge>
                          )}
                        </button>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => void handleToggleAlert(s)}
                            className="p-1 rounded hover:bg-background"
                            aria-label={s.alert_enabled ? 'Disable alert' : 'Enable alert'}
                            title={s.alert_enabled ? 'Disable alert' : 'Enable alert'}
                          >
                            {s.alert_enabled
                              ? <Bell size={13} className="text-primary" />
                              : <BellOff size={13} className="text-muted-foreground" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(s.id)}
                            className="p-1 rounded hover:bg-background"
                            aria-label="Delete"
                          >
                            <Trash2 size={13} className="text-muted-foreground hover:text-destructive" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Reading history link */}
              {onOpenHistory && (
                <>
                  <Separator />
                  <Button
                    variant="ghost"
                    size="sm"
                    style={{ width: '100%', justifyContent: 'flex-start', fontSize: '0.8rem' }}
                    onClick={() => { setOpen(false); onOpenHistory(); }}
                  >
                    <BookOpen size={13} className="mr-2" />
                    Reading history
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
