import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useAuth } from '@/hooks/useAuth';
import {
  questPhase,
  useJoinQuest,
  useMyQuestParticipation,
  useQuestContributors,
  useQuestProgress,
  type Guide,
} from '@/hooks/useGuides';
import { toast } from 'sonner';

/**
 * The community-challenge module rendered on GuideDetail when format='quest':
 * window state, progress vs target, join form, opted-in contributor
 * leaderboard, recap link. Ported from the former QuestDetail page.
 */

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function QuestModule({ guide }: { guide: Guide }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: progress } = useQuestProgress(guide.id);
  const { data: contributors } = useQuestContributors(guide.id);
  const { data: myParticipation } = useMyQuestParticipation(guide.id, user?.id);
  const join = useJoinQuest();

  const [optedIn, setOptedIn] = useState(false);
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    if (myParticipation) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronizes local form state with fetched participation; sync direction not inferable by the compiler.
      setOptedIn(myParticipation.opted_in_public);
      setDisplayName(myParticipation.display_name ?? '');
    }
  }, [myParticipation]);

  const phase = questPhase(guide);
  const accepted = progress?.accepted_count ?? 0;
  const target = progress?.target_count ?? 0;
  const pct = target > 0 ? Math.min(100, Math.round((accepted / target) * 100)) : 0;
  const isActive = phase === 'active';
  const isCompleted = phase === 'completed';
  const criteria = guide.criteria ?? {};

  return (
    <section className="grid gap-8 md:grid-cols-[1fr_280px]" aria-label={t('guides.quest.module', 'Quest')}>
      <div className="space-y-8">
        <div className="flex flex-wrap items-center gap-4">
          <Badge variant={isActive ? 'default' : 'outline'}>
            {isActive
              ? t('guides.quest.liveNow', 'Live now')
              : isCompleted
                ? t('guides.quest.completed', 'Completed')
                : t('guides.quest.scheduled', 'Scheduled')}
          </Badge>
          {guide.starts_at && guide.ends_at && (
            <span className="text-13 text-muted-foreground">
              {fmtDate(guide.starts_at)} – {fmtDate(guide.ends_at)}
            </span>
          )}
        </div>

        <div className="rounded-container border border-border bg-card p-6">
          <h3 className="mb-4 text-2xs uppercase tracking-wider text-muted-foreground">
            {t('guides.quest.criteria', 'Criteria')}
          </h3>
          <ul className="space-y-2 text-15">
            {criteria.entity_type && (
              <li>
                <span className="text-muted-foreground">{t('guides.quest.type', 'Type')}:</span>{' '}
                {criteria.entity_type}
              </li>
            )}
            {target > 0 && (
              <li>
                <span className="text-muted-foreground">{t('guides.quest.target', 'Target')}:</span>{' '}
                {t('guides.quest.contributions', '{{count}} contributions').replace(
                  '{{count}}',
                  String(target),
                )}
              </li>
            )}
            {criteria.tags && criteria.tags.length > 0 && (
              <li>
                <span className="text-muted-foreground">{t('guides.quest.tags', 'Tags')}:</span>{' '}
                {criteria.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="mr-1">
                    {tag}
                  </Badge>
                ))}
              </li>
            )}
            {criteria.region && (
              <li>
                <span className="text-muted-foreground">{t('guides.quest.region', 'Region')}:</span>{' '}
                {criteria.region}
              </li>
            )}
            {criteria.notes && <li className="text-muted-foreground">{criteria.notes}</li>}
          </ul>
        </div>

        {isCompleted && guide.recap_article_id && (
          <div className="rounded-container border border-border bg-card p-6">
            <h3 className="mb-2 text-title">{t('guides.quest.recapTitle', 'Recap published')}</h3>
            <p className="text-15 text-muted-foreground">
              {t(
                'guides.quest.recapBody',
                'Read the editorial recap with named contributor credits in the News section.',
              )}
            </p>
          </div>
        )}
      </div>

      <aside className="space-y-6">
        <div className="rounded-container border border-border bg-card p-6">
          <h3 className="mb-4 text-2xs uppercase tracking-wider text-muted-foreground">
            {t('guides.quest.progress', 'Progress')}
          </h3>
          <div className="text-display leading-none">
            {accepted}
            {target > 0 && <span className="text-muted-foreground"> / {target}</span>}
          </div>
          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-foreground" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-4 text-xs2 text-muted-foreground">
            {t('guides.quest.progressCaption', '{{contributors}} contributors · {{pending}} pending review')
              .replace('{{contributors}}', String(progress?.contributor_count ?? 0))
              .replace('{{pending}}', String(progress?.pending_count ?? 0))}
          </p>
        </div>

        {isActive && (
          <div className="rounded-container border border-border bg-card p-6">
            <h3 className="mb-4 text-2xs uppercase tracking-wider text-muted-foreground">
              {t('guides.quest.join', 'Join')}
            </h3>
            {!user ? (
              <p className="text-15 text-muted-foreground">
                <LocalizedLink to="/auth" className="underline">
                  {t('guides.quest.signIn', 'Sign in')}
                </LocalizedLink>{' '}
                {t('guides.quest.toParticipate', 'to participate.')}
              </p>
            ) : (
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  join.mutate(
                    {
                      guide_id: guide.id,
                      user_id: user.id,
                      opted_in_public: optedIn,
                      display_name: displayName || undefined,
                    },
                    {
                      onSuccess: () =>
                        toast.success(
                          myParticipation
                            ? t('guides.quest.updated', 'Updated')
                            : t('guides.quest.joined', 'Joined quest'),
                        ),
                      onError: (err) => toast.error((err as Error).message),
                    },
                  );
                }}
              >
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="quest-opt-public" className="text-15">
                    {t('guides.quest.showMe', 'Show me in contributors')}
                  </Label>
                  <Switch id="quest-opt-public" checked={optedIn} onCheckedChange={setOptedIn} />
                </div>
                {optedIn && (
                  <div>
                    <Label htmlFor="quest-display-name" className="text-xs2 text-muted-foreground">
                      {t('guides.quest.displayName', 'Display name (optional)')}
                    </Label>
                    <Input
                      id="quest-display-name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder={t('guides.quest.anonymous', 'Anonymous')}
                      maxLength={80}
                    />
                  </div>
                )}
                <Button type="submit" size="sm" className="w-full" disabled={join.isPending}>
                  {myParticipation ? (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      {join.isPending
                        ? t('guides.quest.saving', 'Saving…')
                        : t('guides.quest.update', 'Update')}
                    </>
                  ) : join.isPending ? (
                    t('guides.quest.joining', 'Joining…')
                  ) : (
                    t('guides.quest.joinCta', 'Join quest')
                  )}
                </Button>
              </form>
            )}
          </div>
        )}

        <div className="rounded-container border border-border bg-card p-6">
          <h3 className="mb-4 text-2xs uppercase tracking-wider text-muted-foreground">
            {t('guides.quest.contributors', 'Contributors')}
          </h3>
          {!contributors || contributors.length === 0 ? (
            <p className="text-15 text-muted-foreground">
              {t('guides.quest.noContributors', 'No public contributors yet.')}
            </p>
          ) : (
            <ul className="space-y-2 text-15">
              {contributors.map((c) => (
                <li key={c.user_id} className="flex items-center justify-between">
                  <span className="truncate">{c.display_name}</span>
                  <span className="text-xs2 text-muted-foreground">{c.accepted_count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </section>
  );
}
