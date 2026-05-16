import { useEffect, useState } from 'react';
import { untypedFrom } from '@/integrations/supabase/untyped';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import type { FootprintSharePrefs } from '@/hooks/useFootprintStats';

const KINDS: Array<{ key: keyof FootprintSharePrefs; label: string }> = [
  { key: 'share_countries', label: 'Countries' },
  { key: 'share_cities', label: 'Cities' },
  { key: 'share_venues', label: 'Venues' },
  { key: 'share_events', label: 'Events' },
  { key: 'share_villages', label: 'Villages' },
];

export function ShareControls({ prefs }: { prefs: FootprintSharePrefs }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [local, setLocal] = useState<FootprintSharePrefs>(prefs);

  useEffect(() => setLocal(prefs), [prefs]);

  const toggle = async (k: keyof FootprintSharePrefs) => {
    if (!user) return;
    const next = { ...local, [k]: !local[k] };
    setLocal(next);
    const { error } = await untypedFrom('user_footprint_share_prefs').upsert(
      { user_id: user.id, ...next, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
    if (error) {
      setLocal(local);
      toast({ title: 'Could not save', description: error.message });
      return;
    }
    qc.invalidateQueries({ queryKey: ['footprint-share-prefs', user.id] });
  };

  const publicUrl = user ? `${window.location.origin}/profile/footprint/${user.id}/public` : '';
  const anyOn = Object.values(local).some(Boolean);

  return (
    <details className="border border-border p-3" data-testid="footprint-share-controls">
      <summary className="cursor-pointer text-sm font-medium">Share your footprint publicly</summary>
      <div className="mt-3 space-y-2">
        {KINDS.map((k) => (
          <div key={k.key} className="flex items-center justify-between">
            <Label htmlFor={`share-${k.key}`} className="text-sm">
              {k.label}
            </Label>
            <Switch
              id={`share-${k.key}`}
              checked={local[k.key]}
              onCheckedChange={() => toggle(k.key)}
            />
          </div>
        ))}
        {anyOn && (
          <div className="text-xs text-muted-foreground pt-2 border-t border-border">
            Public URL:{' '}
            <a className="underline" href={publicUrl} target="_blank" rel="noreferrer">
              {publicUrl}
            </a>
          </div>
        )}
      </div>
    </details>
  );
}
