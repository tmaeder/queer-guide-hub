import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Check, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const FORMAT_RE = /^[A-Za-z][A-Za-z0-9]{7,14}$/;

type Status = 'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'error';

interface Props {
  value: string | null;
  onChange: (username: string) => void;
}

export function UsernameSelector({ value, onChange }: Props) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [custom, setCustom] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchNames = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const { data, error } = await supabase.functions.invoke('generate-usernames', {
        body: {},
      });
      if (error) throw error;
      const names = (data as { usernames?: string[] })?.usernames ?? [];
      setSuggestions(names);
    } catch (err) {
      setFetchError(
        err instanceof Error ? err.message : 'Could not generate usernames',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNames();
  }, [fetchNames]);

  const checkAvailability = useCallback(async (candidate: string) => {
    if (!FORMAT_RE.test(candidate)) {
      setStatus('invalid');
      return;
    }
    setStatus('checking');
    const { data, error } = await supabase.rpc('username_available', {
      candidate,
    });
    if (error) {
      setStatus('error');
      return;
    }
    setStatus(data ? 'available' : 'taken');
    if (data) onChange(candidate);
  }, [onChange]);

  const handleCustomChange = (v: string) => {
    setCustom(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!v) {
      setStatus('idle');
      return;
    }
    debounceRef.current = setTimeout(() => checkAvailability(v), 400);
  };

  const handleSelectSuggestion = (name: string) => {
    setCustom('');
    setStatus('idle');
    onChange(name);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>Pick a suggested username</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {loading && suggestions.length === 0 ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 bg-muted animate-pulse" />
            ))
          ) : (
            suggestions.map((name) => (
              <Button
                key={name}
                type="button"
                variant={value === name && !custom ? 'default' : 'outline'}
                onClick={() => handleSelectSuggestion(name)}
                className="justify-start"
              >
                {name}
              </Button>
            ))
          )}
        </div>
        {fetchError && (
          <p className="text-xs text-destructive">{fetchError}</p>
        )}
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={fetchNames}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : null}
            Reroll 🎲
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="username-custom">Or type your own custom username</Label>
        <div className="relative">
          <Input
            id="username-custom"
            value={custom}
            onChange={(e) => handleCustomChange(e.target.value)}
            placeholder="8–15 letters, starts with a letter"
            autoComplete="off"
            spellCheck={false}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            {status === 'checking' && (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            )}
            {status === 'available' && (
              <Check className="w-4 h-4 text-foreground" />
            )}
            {(status === 'taken' || status === 'invalid' || status === 'error') && (
              <X className="w-4 h-4 text-destructive" />
            )}
          </div>
        </div>
        {status === 'invalid' && (
          <p className="text-xs text-muted-foreground">
            8–15 chars, letters/numbers only, must start with a letter.
          </p>
        )}
        {status === 'taken' && (
          <p className="text-xs text-destructive">Username already taken.</p>
        )}
        {status === 'available' && (
          <p className="text-xs text-muted-foreground">Available.</p>
        )}
        {status === 'error' && (
          <p className="text-xs text-destructive">Could not check availability.</p>
        )}
      </div>

      {value && (
        <p className="text-sm">
          Selected: <span className="font-mono">{value}</span>
        </p>
      )}
    </div>
  );
}

export default UsernameSelector;
