import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { updateWishlistSettings } from '@/hooks/useWishlists';

type Visibility = 'private' | 'unlisted' | 'public';

/**
 * Owner controls for one list: name and who can open it. Collapsed by default
 * (a <details>) so the list stays the page's subject. The access wording mirrors
 * get_wishlist_by_slug(): public and unlisted open for anyone with the link.
 */
export function WishlistSettings({
  id,
  title,
  visibility,
  onSaved,
}: {
  id: string;
  title: string;
  visibility: Visibility;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [name, setName] = useState(title);
  const [vis, setVis] = useState<Visibility>(visibility);
  const [saving, setSaving] = useState(false);
  const dirty = name.trim() !== title || vis !== visibility;

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await updateWishlistSettings(id, { title: name.trim(), visibility: vis });
      toast({ title: t('wishlists.settings.saved', 'List updated') });
      onSaved();
    } catch (e) {
      toast({
        title: t('wishlists.settings.failed', 'The list could not be updated'),
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <details className="mt-4 max-w-xl rounded-container bg-card p-4 shadow-soft">
      <summary className="cursor-pointer text-15 font-bold">
        {t('wishlists.settings.title', 'Manage list')}
      </summary>
      <div className="mt-4 flex flex-col gap-4">
        <label className="flex flex-col gap-2 text-13 font-bold">
          {t('wishlists.settings.name', 'Name')}
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        </label>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-13 font-bold">
            {t('wishlists.settings.access', 'Who can open it')}
          </legend>
          {(
            [
              ['private', t('wishlists.settings.private', 'Only me')],
              ['unlisted', t('wishlists.settings.unlisted', 'Anyone with the link')],
              ['public', t('wishlists.settings.public', 'Anyone')],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex min-h-11 items-center gap-2 text-15">
              <input
                type="radio"
                name={`wishlist-visibility-${id}`}
                value={value}
                checked={vis === value}
                onChange={() => setVis(value)}
              />
              {label}
            </label>
          ))}
        </fieldset>
        <div>
          <Button onClick={() => void save()} disabled={!dirty || saving || !name.trim()}>
            {saving ? t('common.saving', 'Saving') : t('common.save', 'Save')}
          </Button>
        </div>
      </div>
    </details>
  );
}
