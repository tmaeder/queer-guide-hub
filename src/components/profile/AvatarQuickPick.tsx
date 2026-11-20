import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { BigHead } from '@bigheads/core';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RefreshCw } from '@/components/icons';
import { generateRandomConfig, type AvatarConfig } from './avatarConfig';

interface Props {
  value: AvatarConfig | null;
  onChange: (config: AvatarConfig) => void;
  /** Select the first avatar of each batch automatically (signup). */
  prepick?: boolean;
  count?: number;
}

const sameConfig = (a: AvatarConfig | null, b: AvatarConfig) =>
  !!a && JSON.stringify(a) === JSON.stringify(b);

/**
 * Minimal one-shot avatar picker: shows N randomized BigHeads, user taps one.
 * Reroll generates a fresh batch. No deep customization — the simplified
 * builder in AvatarChooser covers that.
 */
export function AvatarQuickPick({ value, onChange, count = 6, prepick = false }: Props) {
  const [seed, setSeed] = useState(0);

  const options = useMemo(
    () => Array.from({ length: count }, () => generateRandomConfig()),
    // seed is the reroll trigger — each tick regenerates the batch
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seed, count],
  );

  // Always one of the shown avatars picked: the first of each new batch,
  // unless the current one is already in it.
  const autoPick = useEffectEvent((batch: typeof options) => {
    if (!prepick) return;
    if (batch[0] && !batch.some((cfg) => sameConfig(value, cfg))) onChange(batch[0]);
  });
  useEffect(() => {
    autoPick(options);
  }, [options]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Label>Pick an avatar</Label>
        <Button type="button" variant="ghost" size="sm" onClick={() => setSeed((s) => s + 1)}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Reroll
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {options.map((cfg, i) => {
          const selected = sameConfig(value, cfg);
          return (
            <button
              key={i}
              type="button"
              onClick={() => onChange(cfg)}
              aria-pressed={selected}
              className={`aspect-square rounded-element flex items-center justify-center transition-colors ${
                selected ? 'bg-accent' : 'bg-surface-container hover:bg-surface-container-high'
              }`}
            >
              <div className="w-20 h-20">
                <BigHead {...cfg} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default AvatarQuickPick;
