import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Rainbow } from '@/components/icons';
import { useVenueRating } from '@/hooks/useVenueRating';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { LocalizedLink } from '@/components/routing/LocalizedLink';

export function VenueRatingForm({ venueId, onSaved }: { venueId: string; onSaved: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const { data, isLoading, isError, saveRating } = useVenueRating(venueId);
  const rating = selected ?? data?.rating ?? null;
  const submit = async () => {
    if (!user || rating === null || busy) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await saveRating(rating);
      onSaved();
      setSaved(true);
    } catch {
      setError(t('venues.rating.error', 'Your rating could not be saved. Try again.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mb-6 flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {t(
          'venues.rating.hint',
          'How was your visit? Give this place 0–5 rainbows. Your rating is public.',
        )}
      </p>
      {!user ? (
        <LocalizedLink to="/auth">
          {t('venues.rating.signIn', 'Sign in to rate this place')}
        </LocalizedLink>
      ) : (
        <>
          <fieldset disabled={busy || isLoading || isError}>
            <legend className="mb-2 text-sm font-medium">
              {t('venues.rating.label', 'Your rating')}
            </legend>
            <div className="flex flex-wrap gap-2">
              {[0, 1, 2, 3, 4, 5].map((value) => (
                <label
                  key={value}
                  className="inline-flex min-h-12 cursor-pointer items-center gap-1.5 rounded-element bg-surface-container px-4 py-2 has-[:checked]:bg-foreground has-[:checked]:text-background"
                >
                  <input
                    type="radio"
                    name={`venue-rating-${venueId}`}
                    value={value}
                    checked={rating === value}
                    onChange={() => {
                      setSelected(value);
                      setSaved(false);
                    }}
                    className="accent-current"
                  />
                  <Rainbow size={16} aria-hidden="true" />
                  {value}
                </label>
              ))}
            </div>
          </fieldset>
          {(error || isError) && (
            <p role="alert" className="text-sm text-destructive">
              {error ??
                t(
                  'venues.rating.loadError',
                  'Your previous rating could not be loaded. Refresh to try again.',
                )}
            </p>
          )}
          <div>
            <Button disabled={rating === null || busy || isLoading || isError} onClick={submit}>
              {busy ? t('venues.rating.saving', 'Saving…') : t('venues.rating.save', 'Save rating')}
            </Button>
          </div>
          {saved && (
            <p role="status" className="text-sm">
              {t('venues.rating.saved', 'Your rating is saved.')}
            </p>
          )}
        </>
      )}
    </div>
  );
}
