import { useIntimateProfile, useMyIntimateProfile } from '@/hooks/useIntimateProfile';
import {
  useIntimateMatches,
  useLikeTarget,
  useMyIntimateLikes,
  useMyIntimatePasses,
  usePassTarget,
} from '@/hooks/useIntimateMatches';
import { Button } from '@/components/ui/button';
import { FlatFieldGroup } from '@/components/ui/FlatFieldGroup';
import { getGenitalPictogramSet, bodyPictograms, angleOptions } from '@/assets/intimate/pictograms';
import { KinkVisibleList } from '@/components/kinks/KinkVisibleList';
import { KinkPeerActions } from '@/components/kinks/KinkPeerActions';
import { HankyWorn } from '@/components/intimate/HankyWorn';
import { LikePassActions } from '@/components/intimate/LikePassActions';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useMemberHankySignals, useMyHankySignals } from '@/hooks/useHankySignals';
import { useKinkVisibleList } from '@/hooks/useKinkVisibleList';
import { hankyMatches } from '@/lib/intimate/hankyChecks';

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
 * grid, which applies its own visibility tiers. Report and block live once,
 * in the profile header, for the whole profile.
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
  const { data: profile } = useIntimateProfile(userId);
  const { data: hanky } = useMemberHankySignals(userId);
  const { data: kinkRows } = useKinkVisibleList(userId);
  const { data: myHanky } = useMyHankySignals();
  const { data: me } = useMyIntimateProfile();
  const { data: likedIds = [] } = useMyIntimateLikes();
  const { data: passedIds = [] } = useMyIntimatePasses();
  const { data: matches = [] } = useIntimateMatches();
  const like = useLikeTarget();
  const pass = usePassTarget();

  if (!profile) return null;

  const matched = matches.some((m) => m.other_id === userId);

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

  const name = displayName || 'this member';
  const hasBody = !!(GPicto || BPicto || Angle || profile.size_cm);
  const hasPrefs = !!(
    profile.role?.length ||
    profile.into_tags?.length ||
    profile.safer_sex_prefs?.length
  );
  const hasHanky = !!hanky && Object.keys(hanky).length > 0;
  const hasKinks = (kinkRows?.length ?? 0) > 0;
  const empty = !summary && !hasBody && !hasPrefs && !hasHanky && !hasKinks;

  return (
    <div className="flex flex-col gap-8">
      {/* 1. The decision, with what it does. */}
      {isOwnProfile ? (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-body-lg">This is how other members see your dating profile.</p>
          <Button variant="outline" size="sm" asChild>
            <LocalizedLink to="/settings/dating">Edit dating profile</LocalizedLink>
          </Button>
        </div>
      ) : (
        <section
          aria-labelledby="dating-decide"
          className="flex flex-col gap-4 rounded-container bg-card p-6 shadow-soft"
        >
          <div className="flex flex-col gap-1">
            <h3 id="dating-decide" className="font-sans text-title font-bold">
              {matched ? `You and ${name} matched` : `Interested in ${name}?`}
            </h3>
            <p className="text-sm text-muted-foreground">
              {matched
                ? 'You both liked each other. Say hello.'
                : 'Like them. If they like you back, it’s a match and you can message.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {matched ? (
              <Button asChild>
                <LocalizedLink to="/messages?filter=matches">Message</LocalizedLink>
              </Button>
            ) : (
              <LikePassActions
                onLike={() => like.mutate(userId)}
                onPass={() => pass.mutate(userId)}
                liked={likedIds.includes(userId)}
                passed={passedIds.includes(userId)}
                disabled={like.isPending || pass.isPending}
                labelled
              />
            )}
          </div>
        </section>
      )}

      {/* 2. What they show. */}
      {summary && <p className="text-body-lg">{summary}</p>}
      {empty && !isOwnProfile && (
        <p className="text-muted-foreground">{name} hasn’t filled in a dating profile yet.</p>
      )}

      {hasBody && (
        <FlatFieldGroup title="Body" noTopBorder>
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

      {hasPrefs && (
        <FlatFieldGroup title="Role & preferences" noTopBorder>
          <dl className="space-y-4 text-sm">
            {profile.role?.length ? <Row k="Role" v={profile.role.join(', ')} /> : null}
            {profile.into_tags?.length ? <Row k="Into" v={profile.into_tags.join(', ')} /> : null}
            {profile.safer_sex_prefs?.length ? (
              <Row k="Safer sex" v={profile.safer_sex_prefs.join(', ')} />
            ) : null}
          </dl>
        </FlatFieldGroup>
      )}

      {hasHanky && (
        <FlatFieldGroup title="Hanky code" noTopBorder>
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

      {/* 3. Kink lists are private by default; say what is shared and how to change it. */}
      <FlatFieldGroup
        title="Kink list"
        noTopBorder
        description={
          isOwnProfile
            ? undefined
            : hasKinks
              ? `What ${name} shares with you.`
              : `${name} hasn’t shared their kink list with you. Share yours, or ask to compare: compare shows only what you both like.`
        }
      >
        <KinkVisibleList ownerId={userId} />
        {!isOwnProfile && <KinkPeerActions otherId={userId} otherName={displayName} />}
      </FlatFieldGroup>
    </div>
  );
}
