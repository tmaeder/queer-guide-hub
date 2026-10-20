import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useBlueskyMentions,
  useHideBlueskyMention,
  type MentionEntity,
} from '@/hooks/useBlueskyMentions';
import { usePostModeration } from '@/hooks/useSocialModeration';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { Button } from '@/components/ui/button';
import { bskyPostUrl } from '@/lib/atprotoClient';

/**
 * "On Bluesky": public posts that link to this page (or quote a featured
 * event's title). Self-hides when empty. Never rendered on safety-gated
 * entities — the server returns nothing for them, and `gated` short-circuits
 * the request too. Viewer mutes/muted words apply via usePostModeration.
 */
export function OnBluesky({
  entityType,
  entityId,
  gated,
}: {
  entityType: MentionEntity;
  entityId: string | undefined;
  gated?: boolean;
}) {
  const { t } = useTranslation();
  const { data = [] } = useBlueskyMentions(entityType, gated ? undefined : entityId);
  const { isAdmin, isModerator } = useAdminRoles();
  const canModerate = isAdmin || isModerator;
  const hide = useHideBlueskyMention();

  const asPosts = useMemo(
    () =>
      data.map((m) => ({
        id: m.at_uri,
        user_id: m.author_did,
        content: m.text,
        created_at: m.post_created_at ?? '',
        labels: [],
      })),
    [data],
  );
  const moderation = usePostModeration(asPosts);
  const visible = data.filter((m) => !moderation.get(m.at_uri)?.filter);

  if (gated || visible.length === 0) return null;

  return (
    <section className="my-8" aria-labelledby="on-bluesky-heading">
      <h2
        id="on-bluesky-heading"
        className="mb-4 text-13 uppercase tracking-[0.15em] text-muted-foreground"
      >
        {t('social.onBluesky.title', 'On Bluesky')}
      </h2>
      <ul className="space-y-4">
        {visible.map((m) => {
          const href = bskyPostUrl(m.at_uri);
          return (
            <li key={m.at_uri} className="rounded-element bg-muted/40 p-4">
              <div className="mb-2 flex items-center gap-2">
                {m.author_avatar && (
                  <img
                    src={m.author_avatar}
                    alt=""
                    width={24}
                    height={24}
                    loading="lazy"
                    className="h-6 w-6 rounded-full"
                    onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
                  />
                )}
                <span className="text-13 font-bold">{m.author_name || m.author_handle}</span>
                <span className="text-13 text-muted-foreground">@{m.author_handle}</span>
              </div>
              <p className="whitespace-pre-line text-15">{m.text}</p>
              <div className="mt-2 flex items-center gap-4 text-13 text-muted-foreground">
                {m.post_created_at && (
                  <time dateTime={m.post_created_at}>
                    {new Date(m.post_created_at).toLocaleDateString()}
                  </time>
                )}
                {href && (
                  <a href={href} target="_blank" rel="noopener noreferrer nofollow">
                    {t('social.onBluesky.view', 'View on Bluesky')}
                  </a>
                )}
                {canModerate && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={hide.isPending}
                    onClick={() => hide.mutate(m.at_uri)}
                  >
                    {t('social.onBluesky.hide', 'Hide')}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
