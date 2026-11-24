import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  useIntimateProfile,
  useMyIntimateProfile,
  useReportIntimateProfile,
} from '@/hooks/useIntimateProfile';
import {
  useIntimateMatches,
  useLikeTarget,
  useMyIntimateLikes,
  useMyIntimatePasses,
  usePassTarget,
} from '@/hooks/useIntimateMatches';
import { useBlockUser } from '@/hooks/useIntimateActions';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { Button } from '@/components/ui/button';
import { FlatFieldGroup } from '@/components/ui/FlatFieldGroup';
import { useToast } from '@/hooks/use-toast';
import { getGenitalPictogramSet, bodyPictograms, angleOptions } from '@/assets/intimate/pictograms';
import { KinkVisibleList } from '@/components/kinks/KinkVisibleList';
import { KinkPeerActions } from '@/components/kinks/KinkPeerActions';
import { HankyWorn } from '@/components/intimate/HankyWorn';
import { LikePassActions } from '@/components/intimate/LikePassActions';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useMemberHankySignals, useMyHankySignals } from '@/hooks/useHankySignals';
import { hankyMatches } from '@/lib/intimate/hankyChecks';

const REPORT_REASONS: [string, string][] = [
  ['underage', 'Looks under 18'],
  ['spam', 'Spam or scam'],
  ['impersonation', 'Pretending to be someone'],
  ['hateful', 'Hateful'],
  ['illegal', 'Illegal'],
  ['other', 'Something else'],
];

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 pt-4">
      <dt className="text-muted-foreground shrink-0">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  );
}

/**
 * The 18+ layer of a member profile (/user/:id/dating). Only rendered between
 * opted-in members. `limits` is never displayed; hard limits live in the kink
 * grid, which applies its own visibility tiers.
 */
export function DatingTab({
  userId,
  isOwnProfile,
  displayName,
}: {
  userId: string;
  isOwnProfile: boolean;
  displayName?: string | null;
}) {
  const { user } = useAuth();
  const navigate = useLocalizedNavigate();
  const { toast } = useToast();
  const { data: profile } = useIntimateProfile(userId);
  const { data: hanky } = useMemberHankySignals(userId);
  const { data: myHanky } = useMyHankySignals();
  const { data: me } = useMyIntimateProfile();
  const { data: likedIds = [] } = useMyIntimateLikes();
  const { data: passedIds = [] } = useMyIntimatePasses();
  const { data: matches = [] } = useIntimateMatches();
  const like = useLikeTarget();
  const pass = usePassTarget();
  const report = useReportIntimateProfile();
  const blockMut = useBlockUser();
  const [reportOpen, setReportOpen] = useState(false);

  if (!profile) return null;

  const matched = matches.some((m) => m.other_id === userId);

  const block = async () => {
    if (!user) return;
    try {
      await blockMut.mutateAsync(userId);
      toast({ title: 'Blocked.' });
      navigate('/meet/dating');
    } catch (e) {
      toast({ title: 'Could not block', description: String(e), variant: 'destructive' });
    }
  };

  const submitReport = async (reason: string) => {
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
  const Angle =
    profile.erection_angle_deg !== null
      ? angleOptions.find((a) => a.deg === profile.erection_angle_deg)?.Picto
      : null;
  const summary = [
    profile.age_band,
    profile.body_type,
    profile.height_cm ? `${profile.height_cm}cm` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {summary && <p className="text-sm text-muted-foreground">{summary}</p>}
        {isOwnProfile ? (
          <Button variant="outline" size="sm" asChild>
            <LocalizedLink to="/settings/dating">Edit dating profile</LocalizedLink>
          </Button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <LikePassActions
              onLike={() => like.mutate(userId)}
              onPass={() => pass.mutate(userId)}
              liked={likedIds.includes(userId)}
              passed={passedIds.includes(userId)}
              matched={matched}
              disabled={like.isPending || pass.isPending}
              labelled
            />
            {matched && (
              <Button size="sm" asChild>
                <LocalizedLink to="/messages?filter=matches">Message</LocalizedLink>
              </Button>
            )}
          </div>
        )}
      </div>

      {!!(GPicto || BPicto || Angle || profile.size_cm) && (
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
      )}

      {profile.role?.length || profile.into_tags?.length || profile.safer_sex_prefs?.length ? (
        <FlatFieldGroup title="Profile">
          <dl className="space-y-4 text-sm">
            {profile.role?.length ? <Row k="Role" v={profile.role.join(', ')} /> : null}
            {profile.into_tags?.length ? <Row k="Into" v={profile.into_tags.join(', ')} /> : null}
            {profile.safer_sex_prefs?.length ? (
              <Row k="Safer sex" v={profile.safer_sex_prefs.join(', ')} />
            ) : null}
          </dl>
        </FlatFieldGroup>
      ) : null}

      {hanky && Object.keys(hanky).length > 0 && (
        <FlatFieldGroup title="Hanky code">
          <HankyWorn
            signals={hanky}
            matching={
              isOwnProfile
                ? undefined
                : hankyMatches(hanky, me?.dating_prefs?.seeking?.hanky ?? {}, myHanky ?? {})
            }
          />
        </FlatFieldGroup>
      )}

      <FlatFieldGroup title="Interests & boundaries">
        <KinkVisibleList ownerId={userId} />
        {!isOwnProfile && <KinkPeerActions otherId={userId} otherName={displayName} />}
      </FlatFieldGroup>

      {!isOwnProfile && (
        <div className="flex flex-wrap gap-2">
          <Button variant="soft" onClick={() => setReportOpen((v) => !v)}>
            Report dating profile
          </Button>
          <Button variant="soft" onClick={block}>
            Block
          </Button>
        </div>
      )}

      {reportOpen && (
        <div>
          <p className="mb-4 text-sm font-medium">Reason for report</p>
          <div className="flex flex-wrap gap-2">
            {REPORT_REASONS.map(([r, label]) => (
              <Button key={r} size="sm" variant="soft" onClick={() => submitReport(r)}>
                {label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
