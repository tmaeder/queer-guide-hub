import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { X } from '@/components/icons';
import { useMutedProfiles, useSocialModeration } from '@/hooks/useSocialModeration';
import {
  SELF_LABELS,
  SELF_LABEL_TEXT,
  type LabelPreference,
  type SelfLabel,
} from '@/lib/atprotoModeration';

// Bluesky defaults (DEFAULT_LABEL_SETTINGS), shown before the viewer picks.
const DEFAULT_PREF: Record<SelfLabel, LabelPreference> = {
  porn: 'hide',
  sexual: 'warn',
  nudity: 'ignore',
  'graphic-media': 'warn',
};
const PREF_TEXT: Record<LabelPreference, string> = { hide: 'Hide', warn: 'Warn', ignore: 'Show' };

/** Mutes, muted words and content-label preferences — Bluesky's moderation model. */
export function ModerationSettings() {
  const m = useSocialModeration();
  const { data: mutedProfiles = [] } = useMutedProfiles(m.mutedUserIds);
  const [word, setWord] = useState('');

  const setPref = (label: SelfLabel, pref: LabelPreference) =>
    m.savePrefs.mutate({
      adultContentEnabled: m.adultContentEnabled,
      labelPrefs: { ...m.labelPrefs, [label]: pref },
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Moderation</CardTitle>
        <p className="text-sm text-muted-foreground">
          Muted accounts and words are private. Labels follow the same rules as Bluesky.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="adult-content">Show adult content</Label>
            <p className="text-xs text-muted-foreground">
              Off: posts labelled adult or sexual are hidden and cannot be opened.
            </p>
          </div>
          <Switch
            id="adult-content"
            checked={m.adultContentEnabled}
            onCheckedChange={(on) =>
              m.savePrefs.mutate({ adultContentEnabled: on, labelPrefs: m.labelPrefs })
            }
          />
        </div>

        <fieldset className="flex flex-col gap-4">
          <legend className="text-sm font-medium">Content labels</legend>
          {SELF_LABELS.map((l) => (
            <div key={l} className="flex items-center justify-between gap-4">
              <Label htmlFor={`label-pref-${l}`}>{SELF_LABEL_TEXT[l]}</Label>
              <Select
                value={m.labelPrefs[l] ?? DEFAULT_PREF[l]}
                onValueChange={(v) => setPref(l, v as LabelPreference)}
              >
                <SelectTrigger id={`label-pref-${l}`} className="w-32 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PREF_TEXT) as LabelPreference[]).map((p) => (
                    <SelectItem key={p} value={p}>
                      {PREF_TEXT[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </fieldset>

        <div className="flex flex-col gap-2">
          <Label htmlFor="muted-word">Muted words and tags</Label>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!word.trim()) return;
              m.addMutedWord.mutate({ value: word }, { onSuccess: () => setWord('') });
            }}
          >
            <Input
              id="muted-word"
              value={word}
              maxLength={100}
              onChange={(e) => setWord(e.target.value)}
              placeholder="Word or #tag"
            />
            <Button type="submit" disabled={!word.trim() || m.addMutedWord.isPending}>
              Mute
            </Button>
          </form>
          {m.mutedWords.length === 0 ? (
            <p className="text-xs text-muted-foreground">No muted words yet.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {m.mutedWords.map((w) => (
                <li key={w.id}>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => m.removeMutedWord.mutate(w.id)}
                    aria-label={`Unmute ${w.value}`}
                  >
                    {w.value}
                    <X size={12} className="ml-1" aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-medium">Muted accounts</h4>
          {m.mutedUserIds.length === 0 ? (
            <p className="text-xs text-muted-foreground">No muted accounts yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {m.mutedUserIds.map((id) => {
                const p = mutedProfiles.find((x) => x.user_id === id);
                const name = p?.display_name || (p?.username ? `@${p.username}` : 'Member');
                return (
                  <li key={id} className="flex items-center justify-between gap-4">
                    <span className="text-sm">{name}</span>
                    <Button size="sm" variant="outline" onClick={() => m.unmute.mutate(id)}>
                      Unmute
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
