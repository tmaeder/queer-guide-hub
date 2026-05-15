import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router';
import { Flag, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { EmptyState } from '@/components/ui/EmptyState';
import { useMeta } from '@/hooks/useMeta';
import { useAuth } from '@/hooks/useAuth';
import {
  useQuest,
  useQuestProgress,
  useQuestContributors,
  useMyQuestParticipation,
  useJoinQuest,
} from '@/hooks/useQuests';
import { toast } from 'sonner';

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function QuestDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const { data: quest, isLoading, error } = useQuest(slug);
  const { data: progress } = useQuestProgress(quest?.id);
  const { data: contributors } = useQuestContributors(quest?.id);
  const { data: myParticipation } = useMyQuestParticipation(quest?.id, user?.id);
  const join = useJoinQuest();

  const [optedIn, setOptedIn] = useState(false);
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    if (myParticipation) {
      setOptedIn(myParticipation.opted_in_public);
      setDisplayName(myParticipation.display_name ?? '');
    }
  }, [myParticipation]);

  useMeta({
    title: quest ? `${quest.title} · Editorial Quests` : 'Quest · queer.guide',
    description: quest?.brief_md.slice(0, 160) ?? undefined,
  });

  if (isLoading) {
    return <div className="container mx-auto px-4 py-16 text-center text-muted-foreground">Loading…</div>;
  }
  if (error || !quest) {
    return (
      <div className="container mx-auto px-4 py-16">
        <EmptyState icon={Flag} title="Quest not found." description="This quest may have been archived or never existed." />
      </div>
    );
  }

  const accepted = progress?.accepted_count ?? 0;
  const target = progress?.target_count ?? 0;
  const pct = target > 0 ? Math.min(100, Math.round((accepted / target) * 100)) : 0;
  const isActive = quest.status === 'active';
  const isCompleted = quest.status === 'completed' || quest.status === 'archived';

  return (
    <div className="min-h-screen">
      <div className="container mx-auto max-w-4xl px-4 py-8 md:py-16">
        <Link to="/quests" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> All quests
        </Link>

        <PageHeader
          eyebrow={quest.theme ?? 'Editorial Quest'}
          title={quest.title}
          subtitle={`${fmtDate(quest.starts_at)} – ${fmtDate(quest.ends_at)}`}
          actions={
            <Badge variant={isActive ? 'default' : 'outline'}>
              {isActive ? 'Live now' : isCompleted ? 'Completed' : quest.status}
            </Badge>
          }
        />

        <div className="grid gap-8 md:grid-cols-[1fr_280px]">
          <div className="space-y-8">
            <article className="prose prose-neutral max-w-none dark:prose-invert">
              {quest.brief_md.split('\n\n').map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </article>

            <section className="rounded-container border border-border bg-card p-6">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Criteria</h3>
              <ul className="space-y-2 text-sm">
                {quest.criteria_json.entity_type && (
                  <li><span className="text-muted-foreground">Type:</span> {quest.criteria_json.entity_type}</li>
                )}
                {target > 0 && (
                  <li><span className="text-muted-foreground">Target:</span> {target} contributions</li>
                )}
                {quest.criteria_json.tags && quest.criteria_json.tags.length > 0 && (
                  <li>
                    <span className="text-muted-foreground">Tags:</span>{' '}
                    {quest.criteria_json.tags.map((t) => (
                      <Badge key={t} variant="outline" className="mr-1">{t}</Badge>
                    ))}
                  </li>
                )}
                {quest.criteria_json.region && (
                  <li><span className="text-muted-foreground">Region:</span> {quest.criteria_json.region}</li>
                )}
                {quest.criteria_json.notes && (
                  <li className="text-muted-foreground">{quest.criteria_json.notes}</li>
                )}
              </ul>
            </section>

            {isCompleted && quest.recap_article_id && (
              <div className="rounded-container border border-border bg-card p-6">
                <h3 className="mb-2 text-base font-semibold">Recap published</h3>
                <p className="text-sm text-muted-foreground">
                  Read the editorial recap with named contributor credits in the News section.
                </p>
              </div>
            )}
          </div>

          <aside className="space-y-6">
            <div className="rounded-container border border-border bg-card p-6">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Progress</h3>
              <div className="text-3xl font-semibold">
                {accepted}
                {target > 0 && <span className="text-muted-foreground"> / {target}</span>}
              </div>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-foreground" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {progress?.contributor_count ?? 0} contributors · {progress?.pending_count ?? 0} pending review
              </p>
            </div>

            {isActive && (
              <div className="rounded-container border border-border bg-card p-6">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Join</h3>
                {!user ? (
                  <p className="text-sm text-muted-foreground">
                    <Link to="/auth" className="underline">Sign in</Link> to participate.
                  </p>
                ) : (
                  <form
                    className="space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      join.mutate(
                        {
                          quest_id: quest.id,
                          user_id: user.id,
                          opted_in_public: optedIn,
                          display_name: displayName || undefined,
                        },
                        {
                          onSuccess: () => toast.success(myParticipation ? 'Updated' : 'Joined quest'),
                          onError: (e) => toast.error((e as Error).message),
                        },
                      );
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="opt-public" className="text-sm">Show me in contributors</Label>
                      <Switch id="opt-public" checked={optedIn} onCheckedChange={setOptedIn} />
                    </div>
                    {optedIn && (
                      <div>
                        <Label htmlFor="display-name" className="text-xs text-muted-foreground">Display name (optional)</Label>
                        <Input
                          id="display-name"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          placeholder="Anonymous"
                          maxLength={80}
                        />
                      </div>
                    )}
                    <Button type="submit" size="sm" className="w-full" disabled={join.isPending}>
                      {myParticipation ? (
                        <>
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          {join.isPending ? 'Saving…' : 'Update'}
                        </>
                      ) : (
                        join.isPending ? 'Joining…' : 'Join quest'
                      )}
                    </Button>
                  </form>
                )}
              </div>
            )}

            <div className="rounded-container border border-border bg-card p-6">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Contributors
              </h3>
              {!contributors || contributors.length === 0 ? (
                <p className="text-sm text-muted-foreground">No public contributors yet.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {contributors.map((c) => (
                    <li key={c.user_id} className="flex items-center justify-between">
                      <span className="truncate">{c.display_name}</span>
                      <span className="text-xs text-muted-foreground">{c.accepted_count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
