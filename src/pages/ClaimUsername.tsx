import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useProfile, type Profile } from '@/hooks/useProfile';
import { UsernameSelector } from '@/components/auth/UsernameSelector';
import { AvatarQuickPick } from '@/components/profile/AvatarQuickPick';
import { generateRandomConfig, type AvatarConfig } from '@/components/profile/AvatarBuilder';

export default function ClaimUsername() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading, updateProfile } = useProfile();
  const [pendingUsername, setPendingUsername] = useState<string | null>(null);
  const [pendingAvatar, setPendingAvatar] = useState<AvatarConfig | null>(() => generateRandomConfig());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const username = (profile as (Profile & { username?: string | null }) | null)?.username;

  useEffect(() => {
    if (authLoading || profileLoading) return;
    if (!user) {
      navigate('/auth', { replace: true });
      return;
    }
    if (username) {
      navigate('/', { replace: true });
    }
  }, [authLoading, profileLoading, user, username, navigate]);

  const handleSave = async () => {
    if (!pendingUsername || !pendingAvatar) return;
    setSaving(true);
    setError(null);
    const { error: updateError } = await updateProfile({
      username: pendingUsername,
      avatar_config: pendingAvatar,
      avatar_url: null,
      avatar_type: 'builder',
    } as Partial<Profile>);
    setSaving(false);
    if (updateError) {
      setError(updateError);
      return;
    }
    navigate('/', { replace: true });
  };

  if (authLoading || profileLoading || !user || username) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="py-10 px-4 sm:px-6">
      <Card className="max-w-md mx-auto rounded-container">
        <CardHeader>
          <CardTitle className="text-2xl font-bold tracking-tight text-center text-balance">
            Set up your profile
          </CardTitle>
          <CardDescription className="text-center text-sm">
            Pick a username and an avatar. You can change both later in profile settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <UsernameSelector value={pendingUsername} onChange={setPendingUsername} />
          <AvatarQuickPick value={pendingAvatar} onChange={setPendingAvatar} />
          <Button
            className="w-full"
            disabled={!pendingUsername || !pendingAvatar || saving}
            onClick={handleSave}
          >
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save and continue
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
