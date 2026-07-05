import { useMemo, useState } from 'react';
import Cropper from 'react-easy-crop';
import { BigHead } from '@bigheads/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Upload, Globe, Palette, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { AvatarDisplay } from '@/components/profile/AvatarDisplay';
import type { AvatarConfig } from '@/components/profile/avatarConfig';
import { cropToAvatarBlob, MAX_SOURCE_BYTES, type PixelCrop } from '@/lib/imageCrop';
import { cn } from '@/lib/utils';

const RESOLVE_ENDPOINT = 'https://img.queer.guide/avatar/resolve';

// Handle-based sources by default; gravatar resolves from an email and sits
// behind an explicit extra confirm (the identifier reaches unavatar.io from
// our proxy — never from the browser).
const IMPORT_SOURCES = [
  { value: 'github', label: 'GitHub' },
  { value: 'x', label: 'X / Twitter' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'gravatar', label: 'Gravatar (email)' },
] as const;

// Six curated bases — the "style" choice. Skin tone, hair color and accessory
// are picked separately; everything else comes from the base.
const STYLE_PRESETS: Array<Partial<AvatarConfig>> = [
  { hair: 'short', clothing: 'shirt', clothingColor: 'black', eyes: 'normal', eyebrows: 'raised', mouth: 'grin', body: 'chest', lipColor: 'red', lashes: false },
  { hair: 'long', clothing: 'dress', clothingColor: 'red', eyes: 'happy', eyebrows: 'raised', mouth: 'openSmile', body: 'breasts', lipColor: 'pink', lashes: true },
  { hair: 'buzz', clothing: 'tankTop', clothingColor: 'white', eyes: 'content', eyebrows: 'serious', mouth: 'serious', body: 'chest', lipColor: 'purple', lashes: false },
  { hair: 'bob', clothing: 'vneck', clothingColor: 'green', eyes: 'wink', eyebrows: 'raised', mouth: 'lips', body: 'breasts', lipColor: 'red', lashes: true },
  { hair: 'afro', clothing: 'dressShirt', clothingColor: 'blue', eyes: 'happy', eyebrows: 'raised', mouth: 'openSmile', body: 'chest', lipColor: 'pink', lashes: false },
  { hair: 'bun', clothing: 'shirt', clothingColor: 'white', eyes: 'content', eyebrows: 'serious', mouth: 'grin', body: 'chest', lipColor: 'purple', lashes: true },
];

const SKIN_TONES: AvatarConfig['skinTone'][] = ['light', 'yellow', 'brown', 'red', 'dark', 'black'];
const HAIR_COLORS: AvatarConfig['hairColor'][] = ['black', 'brown', 'blonde', 'orange', 'pink', 'blue', 'white'];
const ACCESSORIES: Array<{ value: AvatarConfig['accessory']; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'roundGlasses', label: 'Glasses' },
  { value: 'tinyGlasses', label: 'Reading' },
  { value: 'shades', label: 'Shades' },
];

const NEUTRAL_BASE: AvatarConfig = {
  accessory: 'none', body: 'chest', clothing: 'shirt', clothingColor: 'black',
  eyebrows: 'raised', eyes: 'normal', facialHair: 'none', graphic: 'none',
  hair: 'short', hairColor: 'black', hat: 'none', hatColor: 'white',
  lashes: false, lipColor: 'red', mask: false, mouth: 'grin',
  skinTone: 'light', circleColor: 'blue',
};

function buildConfig(styleIdx: number, skin: AvatarConfig['skinTone'], hairColor: AvatarConfig['hairColor'], accessory: AvatarConfig['accessory']): AvatarConfig {
  return { ...NEUTRAL_BASE, ...STYLE_PRESETS[styleIdx], skinTone: skin, hairColor, accessory };
}

export interface AvatarSaveData {
  avatarUrl: string | null;
  avatarConfig: AvatarConfig | null;
  avatarType: 'upload' | 'builder' | 'unavatar';
}

interface AvatarChooserProps {
  email: string;
  currentUrl?: string | null;
  currentConfig?: AvatarConfig | null;
  /** Persist the chosen avatar (parent owns the profile write). */
  onSave: (data: AvatarSaveData) => Promise<void> | void;
}

export function AvatarChooser({ email, currentUrl, currentConfig, onSave }: AvatarChooserProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);

  // ---- Upload state
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [cropPixels, setCropPixels] = useState<PixelCrop | null>(null);

  // ---- Import state
  const [source, setSource] = useState<string>('github');
  const [identifier, setIdentifier] = useState('');
  const [emailConfirmed, setEmailConfirmed] = useState(false);
  const [importPreview, setImportPreview] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // ---- Builder state
  const [styleIdx, setStyleIdx] = useState(0);
  const [skin, setSkin] = useState<AvatarConfig['skinTone']>(currentConfig?.skinTone ?? 'light');
  const [hairColor, setHairColor] = useState<AvatarConfig['hairColor']>(currentConfig?.hairColor ?? 'black');
  const [accessory, setAccessory] = useState<AvatarConfig['accessory']>('none');

  const builderConfig = useMemo(
    () => buildConfig(styleIdx, skin, hairColor, accessory),
    [styleIdx, skin, hairColor, accessory],
  );

  const fail = (description: string) =>
    toast({ title: 'Avatar not saved', description, variant: 'destructive' });

  // ---------- Upload path ----------
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return fail('That file is not an image.');
    if (file.size > MAX_SOURCE_BYTES) return fail('Image too large (max 15 MB).');
    setCropSrc(URL.createObjectURL(file));
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  };

  const saveCrop = async () => {
    if (!cropSrc || !cropPixels || !user) return;
    setBusy(true);
    try {
      const blob = await cropToAvatarBlob(cropSrc, cropPixels);
      const fileName = `${user.id}_${Date.now()}.webp`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, blob, { upsert: true, contentType: 'image/webp' });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
      await onSave({ avatarUrl: publicUrl, avatarConfig: null, avatarType: 'upload' });
      URL.revokeObjectURL(cropSrc);
      setCropSrc(null);
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Upload failed — your previous avatar is untouched.');
    } finally {
      setBusy(false);
    }
  };

  // ---------- Import path ----------
  const resolveImport = async () => {
    setImportError(null);
    setImportPreview(null);
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sign in again to import an avatar.');
      const res = await fetch(RESOLVE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ source, identifier: identifier.trim() }),
      });
      const body = (await res.json()) as { url?: string; error?: string };
      if (res.status === 404) {
        setImportError('No image found for that handle.');
        return;
      }
      if (!res.ok || !body.url) {
        setImportError('Lookup failed — try again.');
        return;
      }
      setImportPreview(body.url);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Lookup failed — try again.');
    } finally {
      setBusy(false);
    }
  };

  const confirmImport = async () => {
    if (!importPreview) return;
    setBusy(true);
    try {
      await onSave({ avatarUrl: importPreview, avatarConfig: null, avatarType: 'unavatar' });
      setImportPreview(null);
      setIdentifier('');
    } finally {
      setBusy(false);
    }
  };

  // ---------- Builder path ----------
  const saveBuilder = async () => {
    setBusy(true);
    try {
      await onSave({ avatarUrl: null, avatarConfig: builderConfig, avatarType: 'builder' });
    } finally {
      setBusy(false);
    }
  };

  const needsEmailConfirm = source === 'gravatar';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-center">
        <AvatarDisplay avatarUrl={currentUrl ?? undefined} avatarConfig={currentConfig ?? undefined} email={email} size="lg" />
      </div>

      <Tabs defaultValue="create" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="upload"><Upload size={16} className="mr-2" />Upload</TabsTrigger>
          <TabsTrigger value="import"><Globe size={16} className="mr-2" />Import</TabsTrigger>
          <TabsTrigger value="create"><Palette size={16} className="mr-2" />Create</TabsTrigger>
        </TabsList>

        {/* ---------- Upload ---------- */}
        <TabsContent value="upload" className="mt-4 flex flex-col gap-4">
          {!cropSrc ? (
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-muted-foreground rounded-element cursor-pointer transition-colors hover:bg-muted">
              <Upload size={32} className="mb-2 text-muted-foreground" />
              <p className="text-sm"><span className="font-semibold">Choose a photo</span></p>
              <p className="text-xs text-muted-foreground">Cropped on your device, uploaded as a small square</p>
              <input type="file" className="hidden" accept="image/*" onChange={handleFileSelect} />
            </label>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="relative w-full h-64 bg-muted rounded-element overflow-hidden">
                <Cropper
                  image={cropSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  cropShape="round"
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={(_area, pixels) => setCropPixels(pixels)}
                />
              </div>
              <div className="flex items-center gap-4">
                <Label htmlFor="avatar-zoom" className="text-xs text-muted-foreground shrink-0">Zoom</Label>
                <input
                  id="avatar-zoom"
                  type="range"
                  min={1}
                  max={4}
                  step={0.05}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full accent-foreground"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={saveCrop} disabled={busy} className="flex-1">
                  {busy && <Loader2 size={16} className="mr-2 animate-spin" />}
                  Save photo
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    URL.revokeObjectURL(cropSrc);
                    setCropSrc(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ---------- Import ---------- */}
        <TabsContent value="import" className="mt-4 flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">
            We look this up through our own server via unavatar.io. What you type here is sent to
            unavatar.io from our infrastructure — never from your device — and the image is stored
            on our servers.
          </p>
          <div className="grid grid-cols-[140px_1fr] gap-2">
            <Select value={source} onValueChange={(v) => { setSource(v); setEmailConfirmed(false); setImportPreview(null); setImportError(null); }}>
              <SelectTrigger aria-label="Import source"><SelectValue /></SelectTrigger>
              <SelectContent>
                {IMPORT_SOURCES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={identifier}
              onChange={(e) => { setIdentifier(e.target.value); setImportPreview(null); setImportError(null); }}
              placeholder={needsEmailConfirm ? 'email address' : 'handle, e.g. mariposa'}
              autoComplete="off"
              spellCheck={false}
              aria-label="Handle or email to import from"
            />
          </div>
          {needsEmailConfirm && (
            <label
              htmlFor="gravatar-consent"
              className="flex items-start gap-2 text-xs text-muted-foreground"
            >
              <Checkbox
                id="gravatar-consent"
                checked={emailConfirmed}
                onCheckedChange={(c) => setEmailConfirmed(c === true)}
                className="mt-0.5"
              />
              <span>
                I understand this email address will be sent to unavatar.io (via the queer.guide
                proxy) to look up a Gravatar image.
              </span>
            </label>
          )}
          {importError && <p className="text-xs text-destructive" role="alert">{importError}</p>}
          {!importPreview ? (
            <Button
              onClick={resolveImport}
              disabled={busy || !identifier.trim() || (needsEmailConfirm && !emailConfirmed)}
            >
              {busy && <Loader2 size={16} className="mr-2 animate-spin" />}
              Look up
            </Button>
          ) : (
            <div className="flex items-center gap-4">
              <img src={importPreview} alt="Imported avatar preview" className="w-16 h-16 rounded-full border border-border object-cover" />
              <div className="flex gap-2">
                <Button onClick={confirmImport} disabled={busy}>Use this</Button>
                <Button variant="outline" disabled={busy} onClick={() => setImportPreview(null)}>Try another</Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ---------- Create ---------- */}
        <TabsContent value="create" className="mt-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium" id="avatar-style-label">Style</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setStyleIdx(Math.floor(Math.random() * STYLE_PRESETS.length));
                setSkin(SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)]);
                setHairColor(HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)]);
              }}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Reroll
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2" role="group" aria-labelledby="avatar-style-label">
            {STYLE_PRESETS.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setStyleIdx(i)}
                aria-pressed={styleIdx === i}
                aria-label={`Style ${i + 1}`}
                className={cn(
                  'aspect-square rounded-element border-2 flex items-center justify-center transition-colors',
                  styleIdx === i ? 'border-foreground bg-accent' : 'border-border hover:border-foreground/50',
                )}
              >
                <div className="w-16 h-16">
                  <BigHead {...buildConfig(i, skin, hairColor, accessory)} />
                </div>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor="avatar-skin">Skin tone</Label>
              <Select value={skin} onValueChange={(v) => setSkin(v as AvatarConfig['skinTone'])}>
                <SelectTrigger id="avatar-skin"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SKIN_TONES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="avatar-hair">Hair color</Label>
              <Select value={hairColor} onValueChange={(v) => setHairColor(v as AvatarConfig['hairColor'])}>
                <SelectTrigger id="avatar-hair"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {HAIR_COLORS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="avatar-accessory">Accessory</Label>
              <Select value={accessory} onValueChange={(v) => setAccessory(v as AvatarConfig['accessory'])}>
                <SelectTrigger id="avatar-accessory"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACCESSORIES.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button onClick={saveBuilder} disabled={busy}>
            {busy && <Loader2 size={16} className="mr-2 animate-spin" />}
            Use this avatar
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}
