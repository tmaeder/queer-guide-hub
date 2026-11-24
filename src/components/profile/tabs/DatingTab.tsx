import type { ReactNode } from 'react';
import { useIntimateProfile, useMyIntimateProfile } from '@/hooks/useIntimateProfile';
import {
  useIntimateMatches,
  useLikeTarget,
  useMyIntimateLikes,
  useMyIntimatePasses,
  usePassTarget,
} from '@/hooks/useIntimateMatches';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getGenitalPictogramSet, bodyPictograms, angleOptions } from '@/assets/intimate/pictograms';
import { KinkVisibleList } from '@/components/kinks/KinkVisibleList';
import { KinkPeerActions } from '@/components/kinks/KinkPeerActions';
import { HankyWorn } from '@/components/intimate/HankyWorn';
import { LikePassActions } from '@/components/intimate/LikePassActions';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useMemberHankySignals, useMyHankySignals } from '@/hooks/useHankySignals';
import { useKinkVisibleList } from '@/hooks/useKinkVisibleList';
import { hankyMatches } from '@/lib/intimate/hankyChecks';

/** Stored values are slugs ("vers-top"); show them as words ("Vers top"). */
const word = (s: string) => (s.charAt(0).toUpperCase() + s.slice(1)).replace(/-/g, ' ');

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-4 rounded-container bg-card p-6 shadow-soft"
    >
      <div className="flex flex-col gap-1">
        <h3 className="font-sans text-title font-bold">{title}</h3>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function Chips({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <ul className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <li key={v}>
            <Badge variant="secondary" className="rounded-badge">
              {word(v)}
            </Badge>
          </li>
        ))}
      </ul>
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
  const name = displayName || 'this member';

  const GPicto = profile.genital_pictogram_key
    ? getGenitalPictogramSet(profile.genitalia)[profile.genital_pictogram_key]
    : null;
  const BPicto = profile.body_pictogram_key ? bodyPictograms[profile.body_pictogram_key] : null;
  const Angle =
    profile.erection_angle_deg !== null
      ? angleOptions.find((a) => a.deg === profile.erection_angle_deg)?.Picto
      : null;
  const pictos = [BPicto, GPicto, Angle].filter(Boolean) as NonNullable<typeof BPicto>[];

  const facts = (
    [
      ['Age', profile.age_band],
      ['Build', profile.body_type ? word(profile.body_type) : null],
      ['Height', profile.height_cm ? `${profile.height_cm} cm` : null],
      ['Role', profile.role?.length ? profile.role.map(word).join(', ') : null],
      [
        'Size',
        profile.size_cm
          ? `${profile.size_cm} cm${profile.erection_angle_deg !== null ? ` · ${profile.erection_angle_deg}°` : ''}`
          : null,
      ],
    ] as [string, string | null | undefined][]
  ).filter((f): f is [string, string] => !!f[1]);
  const into = profile.into_tags ?? [];
  const safer = profile.safer_sex_prefs ?? [];

  const hasGlance = facts.length > 0 || pictos.length > 0 || into.length > 0 || safer.length > 0;
  const hasHanky = !!hanky && Object.keys(hanky).length > 0;
  const hasKinks = (kinkRows?.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-6">
      {isOwnProfile ? (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-muted-foreground">
            This is how other members see your dating profile.
          </p>
          <Button variant="outline" size="sm" asChild>
            <LocalizedLink to="/settings/dating">Edit dating profile</LocalizedLink>
          </Button>
        </div>
      ) : (
        <Panel
          title={matched ? `You and ${name} matched` : `Interested in ${name}?`}
          description={
            matched
              ? 'You both liked each other. Say hello.'
              : 'Like them. If they like you back, it’s a match and you can message.'
          }
        >
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
        </Panel>
      )}

      {hasGlance ? (
        <Panel title="At a glance">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            {pictos.length > 0 && (
              <div aria-hidden="true" className="flex shrink-0 gap-2">
                {pictos.map((P, i) => (
                  <span key={i} className="rounded-element bg-muted p-2">
                    <P width={56} height={56} />
                  </span>
                ))}
              </div>
            )}
            {facts.length > 0 && (
              <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
                {facts.map(([k, v]) => (
                  <div key={k} className="flex flex-col gap-0.5">
                    <dt className="text-2xs uppercase tracking-wide text-muted-foreground">{k}</dt>
                    <dd className="text-15 font-bold">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
          {into.length > 0 && <Chips label="Into" values={into} />}
          {safer.length > 0 && <Chips label="Safer sex" values={safer} />}
        </Panel>
      ) : (
        !isOwnProfile && (
          <p className="text-muted-foreground">{name} hasn’t filled in a dating profile yet.</p>
        )
      )}

      {hasHanky && (
        <Panel title="Hanky code">
          <HankyWorn
            signals={hanky}
            matching={
              isOwnProfile
                ? undefined
                : hankyMatches(hanky, me?.dating_prefs?.seeking?.hanky ?? {}, myHanky ?? {})
            }
          />
        </Panel>
      )}

      <Panel
        title="Kink list"
        description={
          isOwnProfile
            ? 'Each category shows to the people you chose in your checklist.'
            : hasKinks
              ? `What ${name} shares with you.`
              : `${name} hasn’t shared their kink list with you. Share yours, or ask to compare: compare shows only what you both like.`
        }
      >
        <KinkVisibleList ownerId={userId} />
        {isOwnProfile && !hasKinks && (
          <Button variant="outline" size="sm" className="self-start" asChild>
            <LocalizedLink to="/tools/checklist">Fill in your checklist</LocalizedLink>
          </Button>
        )}
        {!isOwnProfile && <KinkPeerActions otherId={userId} otherName={displayName} />}
      </Panel>
    </div>
  );
}
