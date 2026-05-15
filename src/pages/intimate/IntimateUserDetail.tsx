import { useParams, useNavigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { useIntimateProfile, useMyIntimateProfile, useReportIntimateProfile } from '@/hooks/useIntimateProfile';
import { useBlockUser, useProfileDisplay, useSendFriendRequest } from '@/hooks/useIntimateActions';
import { Button } from '@/components/ui/button';
import { FlatFieldGroup } from '@/components/ui/FlatFieldGroup';
import { useToast } from '@/hooks/use-toast';
import { getGenitalPictogramSet, bodyPictograms, angleOptions } from '@/assets/intimate/pictograms';
import { useState } from 'react';

export default function IntimateUserDetail() {
  const { userId } = useParams<{ userId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: me } = useMyIntimateProfile();
  const { data: profile, isLoading } = useIntimateProfile(userId);
  const report = useReportIntimateProfile();
  const { data: displayProfile } = useProfileDisplay(userId);
  const sendRequestMut = useSendFriendRequest();
  const blockMut = useBlockUser();

  const [reportOpen, setReportOpen] = useState(false);

  if (isLoading) return <div className="p-8">Loading…</div>;
  if (!me?.opted_in_at) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <p className="mb-6">Opt in to view intimate profiles.</p>
        <Button onClick={() => navigate('/intimate/onboard')}>Get started</Button>
      </div>
    );
  }
  if (!profile) {
    return <div className="p-8">Not available.</div>;
  }

  const sendRequest = async () => {
    if (!user || !userId) return;
    try {
      await sendRequestMut.mutateAsync(userId);
      toast({ title: 'Friend request sent — you can DM once they accept.' });
    } catch (e) {
      toast({ title: 'Could not send', description: String(e), variant: 'destructive' });
    }
  };

  const block = async () => {
    if (!user || !userId) return;
    try {
      await blockMut.mutateAsync(userId);
      toast({ title: 'Blocked.' });
      navigate('/intimate');
    } catch (e) {
      toast({ title: 'Could not block', description: String(e), variant: 'destructive' });
    }
  };

  const submitReport = async (reason: string) => {
    if (!userId) return;
    try {
      await report.mutateAsync({ targetId: userId, reason });
      toast({ title: 'Reported. Moderation will review.' });
      setReportOpen(false);
    } catch (e) {
      toast({ title: 'Could not report', description: String(e), variant: 'destructive' });
    }
  };

  const GPicto = profile.genital_pictogram_key
    ? getGenitalPictogramSet(profile.genitalia)[profile.genital_pictogram_key]
    : null;
  const BPicto = profile.body_pictogram_key ? bodyPictograms[profile.body_pictogram_key] : null;
  const Angle = profile.erection_angle_deg !== null
    ? angleOptions.find((a) => a.deg === profile.erection_angle_deg)?.Picto
    : null;

  function Row({ k, v }: { k: string; v: string }) {
    return (
      <div className="flex justify-between gap-4 border-t border-border pt-3">
        <dt className="text-muted-foreground shrink-0">{k}</dt>
        <dd className="text-right">{v}</dd>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <header className="flex items-center gap-4 pb-6 border-b border-border">
        {displayProfile?.avatar_url ? (
          <img
            src={displayProfile.avatar_url}
            alt=""
            className="h-16 w-16 object-cover rounded-element"
          />
        ) : (
          <div className="h-16 w-16 bg-muted rounded-element" />
        )}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {displayProfile?.display_name ?? 'Anon'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {[profile.age_band, profile.body_type, profile.height_cm ? `${profile.height_cm}cm` : null]
              .filter(Boolean).join(' · ')}
          </p>
        </div>
      </header>

      <FlatFieldGroup title="Body & anatomy">
        <div className="flex flex-wrap gap-4">
          {GPicto && <GPicto width={80} height={80} />}
          {BPicto && <BPicto width={80} height={80} />}
          {Angle && <Angle width={80} height={80} />}
        </div>
        {profile.size_cm && (
          <p className="text-sm text-muted-foreground">
            Size: {profile.size_cm} cm
            {profile.erection_angle_deg !== null ? ` · ${profile.erection_angle_deg}°` : ''}
          </p>
        )}
      </FlatFieldGroup>

      <FlatFieldGroup title="Profile">
        <dl className="space-y-3 text-sm">
          {profile.role?.length ? <Row k="Role" v={profile.role.join(', ')} /> : null}
          {profile.into_tags?.length ? <Row k="Into" v={profile.into_tags.join(', ')} /> : null}
          {profile.limits?.length ? <Row k="Limits" v={profile.limits.join(', ')} /> : null}
          {profile.safer_sex_prefs?.length ? <Row k="Safer sex" v={profile.safer_sex_prefs.join(', ')} /> : null}
        </dl>
      </FlatFieldGroup>

      <div className="border-t border-border pt-6 flex flex-wrap gap-2">
        <Button onClick={sendRequest} className="rounded-element">Send friend request</Button>
        <Button variant="outline" onClick={() => setReportOpen((v) => !v)} className="rounded-element">Report</Button>
        <Button variant="outline" onClick={block} className="rounded-element">Block</Button>
      </div>

      {reportOpen && (
        <div className="mt-6 border-t border-border pt-6">
          <p className="text-sm font-medium mb-3">Reason for report</p>
          <div className="flex flex-wrap gap-2">
            {['underage','spam','impersonation','hateful','illegal','other'].map((r) => (
              <Button
                key={r}
                size="sm"
                variant="outline"
                onClick={() => submitReport(r)}
                className="rounded-element"
              >
                {r}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
