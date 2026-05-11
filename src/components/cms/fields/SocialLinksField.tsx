import { useMemo, useState } from 'react';
import {
  Globe,
  Music,
  Plus,
  X,
} from 'lucide-react';
import { Twitter, Instagram, Linkedin, Github, Facebook, Youtube } from '@/components/icons/brand';
import { FieldWrapper } from './FieldWrapper';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { FieldProps } from './FieldRenderer';

interface PlatformDef {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  detect?: RegExp;
  placeholder: string;
}

const PLATFORMS: PlatformDef[] = [
  { key: 'instagram', label: 'Instagram', icon: Instagram, detect: /instagram\.com\//i, placeholder: 'https://instagram.com/username' },
  { key: 'facebook', label: 'Facebook', icon: Facebook, detect: /facebook\.com\//i, placeholder: 'https://facebook.com/username' },
  { key: 'twitter', label: 'X (Twitter)', icon: Twitter, detect: /(?:twitter|x)\.com\//i, placeholder: 'https://x.com/username' },
  { key: 'tiktok', label: 'TikTok', icon: Music, detect: /tiktok\.com\//i, placeholder: 'https://tiktok.com/@username' },
  { key: 'youtube', label: 'YouTube', icon: Youtube, detect: /youtube\.com\//i, placeholder: 'https://youtube.com/@username' },
  { key: 'linkedin', label: 'LinkedIn', icon: Linkedin, detect: /linkedin\.com\//i, placeholder: 'https://linkedin.com/in/username' },
  { key: 'github', label: 'GitHub', icon: Github, detect: /github\.com\//i, placeholder: 'https://github.com/username' },
  { key: 'threads', label: 'Threads', icon: Globe, detect: /threads\.net\//i, placeholder: 'https://threads.net/@username' },
  { key: 'bluesky', label: 'Bluesky', icon: Globe, detect: /bsky\.app\//i, placeholder: 'https://bsky.app/profile/handle' },
  { key: 'mastodon', label: 'Mastodon', icon: Globe, detect: /mastodon|@.+@/i, placeholder: 'https://mastodon.social/@username' },
  { key: 'spotify', label: 'Spotify', icon: Music, detect: /spotify\.com\//i, placeholder: 'https://open.spotify.com/artist/...' },
  { key: 'soundcloud', label: 'SoundCloud', icon: Music, detect: /soundcloud\.com\//i, placeholder: 'https://soundcloud.com/username' },
  { key: 'patreon', label: 'Patreon', icon: Globe, detect: /patreon\.com\//i, placeholder: 'https://patreon.com/username' },
  { key: 'website', label: 'Website', icon: Globe, placeholder: 'https://example.com' },
];

const PLATFORM_MAP = new Map(PLATFORMS.map((p) => [p.key, p]));

function detectPlatformKey(url: string): string {
  for (const p of PLATFORMS) {
    if (p.detect?.test(url)) return p.key;
  }
  return 'website';
}

function toRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string') out[k.toLowerCase()] = v;
  }
  return out;
}

export function SocialLinksField({ field, value, onChange, error, disabled }: FieldProps) {
  const links = useMemo(() => toRecord(value), [value]);
  const [quickAdd, setQuickAdd] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  const update = (next: Record<string, string>) => {
    const cleaned: Record<string, string> = {};
    for (const [k, v] of Object.entries(next)) {
      if (v.trim() !== '') cleaned[k] = v.trim();
    }
    onChange(Object.keys(cleaned).length === 0 ? null : cleaned);
  };

  const setUrl = (key: string, url: string) => update({ ...links, [key]: url });
  const remove = (key: string) => {
    const next = { ...links };
    delete next[key];
    update(next);
  };

  const addPlatform = (key: string) => {
    if (links[key] !== undefined) return;
    update({ ...links, [key]: '' });
    setPickerOpen(false);
  };

  const handleQuickAdd = () => {
    const url = quickAdd.trim();
    if (!url) return;
    const normalized = url.startsWith('http') ? url : `https://${url}`;
    const key = detectPlatformKey(normalized);
    update({ ...links, [key]: normalized });
    setQuickAdd('');
  };

  const entries = Object.entries(links);
  const availablePlatforms = PLATFORMS.filter((p) => links[p.key] === undefined);

  return (
    <FieldWrapper field={field} error={error}>
      <div className="flex flex-col gap-2">
        {entries.map(([key, url]) => {
          const def = PLATFORM_MAP.get(key);
          const Icon = def?.icon ?? Globe;
          return (
            <div key={key} className="flex items-center gap-2">
              <div className="flex items-center gap-2 w-32 shrink-0 text-sm">
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{def?.label ?? key}</span>
              </div>
              <Input
                value={url}
                onChange={(e) => setUrl(key, e.target.value)}
                placeholder={def?.placeholder ?? 'https://...'}
                disabled={disabled}
                className="flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remove(key)}
                disabled={disabled}
                aria-label={`Remove ${def?.label ?? key}`}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          );
        })}

        {!disabled && (
          <div className="flex flex-col gap-2 pt-1">
            <div className="flex items-center gap-2">
              <Input
                value={quickAdd}
                onChange={(e) => setQuickAdd(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleQuickAdd();
                  }
                }}
                placeholder="Paste any social URL — platform auto-detected"
                className="flex-1"
              />
              <Button type="button" onClick={handleQuickAdd} disabled={!quickAdd.trim()}>
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>

            {availablePlatforms.length > 0 && (
              <Select
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                value=""
                onValueChange={addPlatform}
              >
                <SelectTrigger className="w-fit">
                  <SelectValue placeholder="+ Add platform" />
                </SelectTrigger>
                <SelectContent>
                  {availablePlatforms.map((p) => {
                    const Icon = p.icon;
                    return (
                      <SelectItem key={p.key} value={p.key}>
                        <span className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          {p.label}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}
          </div>
        )}
      </div>
    </FieldWrapper>
  );
}
