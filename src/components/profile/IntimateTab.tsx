import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  useMyIntimateProfile,
  useOptOutIntimateProfile,
} from '@/hooks/useIntimateProfile';

export function IntimateTab() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: me, isLoading } = useMyIntimateProfile();
  const optOut = useOptOutIntimateProfile();

  if (isLoading) return <p>Loading…</p>;

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
    <Card>
      <CardContent className="p-6 space-y-4">
        <header>
          <h2 className="text-lg font-semibold">Intimate profile</h2>
          <p className="text-sm text-muted-foreground">
            Optional add-on. Hidden by default. Visible only to other users who have also opted in.
          </p>
        </header>

        {!enabled ? (
          <>
            <p className="text-sm">
              Enable an explicit, pictogram-based profile to connect with other opted-in users
              for travel hookups, local cruising, kink, or a privacy-preserving alternative to
              photo-based apps.
            </p>
            <Button onClick={() => navigate('/intimate/onboard')}>Enable intimate profile</Button>
          </>
        ) : (
          <>
            <p className="text-sm">Your intimate profile is active.</p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => navigate('/intimate/onboard')}>Edit</Button>
              <Button variant="outline" onClick={() => navigate('/intimate')}>Open discovery</Button>
              <Button variant="outline" onClick={handleDisable} disabled={optOut.isPending}>
                Hide (keep data)
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={optOut.isPending}>
                Delete intimate profile
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
