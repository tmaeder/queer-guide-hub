import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useMyIntimateProfile, useOptOutIntimateProfile } from '@/hooks/useIntimateProfile';
import { FlatFieldGroup } from '@/components/ui/FlatFieldGroup';
import { Skeleton } from '@/components/ui/skeleton';

export function IntimateTab() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: me, isLoading } = useMyIntimateProfile();
  const optOut = useOptOutIntimateProfile();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 py-4" role="status" aria-label="Loading intimate profile">
        <span className="sr-only">Loading intimate profile</span>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-16 w-full rounded-element" />
      </div>
    );
  }

  const enabled = !!me?.opted_in_at;

  const handleDisable = async () => {
    await optOut.mutateAsync({});
    toast({ title: 'Intimate profile hidden. Your data is preserved.' });
  };

  const handleDelete = async () => {
    if (!window.confirm('Permanently delete your intimate profile? This cannot be undone.')) return;
    await optOut.mutateAsync({ hardDelete: true });
    toast({ title: 'Intimate profile deleted.' });
  };

  return (
    <FlatFieldGroup
      title="Intimate profile"
      description="Optional add-on. Hidden by default. Visible only to other users who have also opted in."
      noTopBorder
    >
      {!enabled ? (
        <>
          <p className="text-sm leading-relaxed text-foreground">
            Enable an explicit, pictogram-based profile to connect with other opted-in users for
            travel hookups, local cruising, kink, or a privacy-preserving alternative to photo-based
            apps.
          </p>
          <Button onClick={() => navigate('/intimate/onboard')} className="rounded-element">
            Enable intimate profile
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm">Your intimate profile is active.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => navigate('/intimate/onboard')} className="rounded-element">
              Edit
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate('/tools/checklist')}
              className="rounded-element"
            >
              Interests & boundaries checklist
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate('/intimate')}
              className="rounded-element"
            >
              Open discovery
            </Button>
            <Button
              variant="outline"
              onClick={handleDisable}
              disabled={optOut.isPending}
              className="rounded-element"
            >
              Hide (keep data)
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={optOut.isPending}
              className="rounded-element"
            >
              Delete intimate profile
            </Button>
          </div>
        </>
      )}
    </FlatFieldGroup>
  );
}
