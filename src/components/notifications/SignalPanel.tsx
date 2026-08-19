import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RouteBullet } from '@/components/transit/RouteBullet';
import { TrackSwatch } from '@/components/transit/TrackSwatch';
import { untypedRpc } from '@/integrations/supabase/untyped';
import { useInboxFeed, type InboxItem } from '@/hooks/useInboxFeed';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { LocalizedLink } from '@/components/routing/LocalizedLink';

/**
 * Signal — the bell popover ("Header and Footer.dc.html", panel 05).
 *
 * The panel is an ISLAND, not a menu: "Same geometry as the floating bars:
 * paper surface, 18px radius, heavy shadow, inset from whatever anchors them.
 * No carets — the anchor's badge and the gap do the pointing." Its geometry is
 * therefore owned by NotificationBell's popover, and this file owns the
 * contents only.
 *
 * Three rules from the spec are load-bearing, not decorative:
 *
 *  1. "The safety notice never mixes." Safety pins to the top in ink, ABOVE
 *     and OUTSIDE the read/unread list. It is not a row, it cannot be swept by
 *     "mark all read" (enforced in the RPC, not here — a client-side filter is
 *     not a guarantee), and it carries no unread dot because it is a standing
 *     condition rather than an item you clear.
 *  2. "Unread is a station dot" — a filled dot on the right, "not a
 *     bold-vs-regular guessing game". Presence/absence carries the state, so
 *     the cue survives colour-blindness; the sr-only label carries it for
 *     screen readers.
 *  3. "The bullet's colour is the track the notification rode in on." That
 *     track is resolved through ROUTE_BULLET_MAP (via RouteBullet's `type`),
 *     never a second local colour table — an event alert has to carry the same
 *     bullet the event itself carries on the map, in search and on its page.
 *
 * One deliberate deviation from the spec, and it is a safety call: the mock
 * says the safety notice "does not count toward the badge". In this product
 * the safety-class notification is `sos` — a distress signal from another
 * rider, not a standing venue advisory like the mock's door-policy example. A
 * distress signal that does not raise the badge is a silent one, so it stays
 * counted. What does hold is the other half of the rule: bulk "mark all read"
 * cannot clear it.
 */

/** Notification subtype → the entity whose bullet it rides.
 *
 *  Keys are the `subtype` column of `get_inbox_feed`, which is
 *  `notifications.type` (a closed CHECK list) for personal alerts and
 *  `group_notifications.notification_type` for group activity, plus the two
 *  synthesised post-engagement subtypes.
 *
 *  Values are `ROUTE_BULLET_MAP` keys. Anything absent falls through to
 *  RouteBullet's unmapped ink bullet, which is the correct answer for
 *  `system`: it did not ride a line. */
const SIGNAL_ENTITY: Record<string, string> = {
  // Tonight — a door, a time, a room.
  event: 'event',
  event_reminder: 'event',
  // Travel.
  trip_nudge: 'trip',
  traveler_incoming: 'trip',
  // People. These are only reached when the alert carries no avatar; when it
  // does, the face IS the bullet (see `bulletFor`).
  new_match: 'personality',
  wave: 'personality',
  someone_nearby: 'personality',
  friend_request: 'personality',
  friend_accepted: 'personality',
  dm: 'personality',
  message: 'personality',
  // Community — group activity and engagement on your own posts.
  mention: 'group',
  new_post: 'group',
  new_announcement: 'group',
  new_poll: 'group',
  post_liked: 'group',
  comment_liked: 'group',
  post_like: 'group',
  post_comment: 'group',
  group_invite: 'group',
  // Contributions you filed.
  submission_update: 'page',
  watch_import: 'page',
};

/** The one subtype that is safety-class. Kept as a set rather than an equality
 *  test so adding a second class (a venue advisory, say) is one entry and not
 *  a second code path. */
const SAFETY_SUBTYPES = new Set(['sos']);

/** Terse, LOCALISED stamp for the right edge of a row: "12 min", "1 hr",
 *  "1 day". Two things it is deliberately NOT:
 *
 *  - `timeAgo` (utils/timezone): hardcoded English, and it appends "ago",
 *    which is both untranslatable across the app's 11 locales and too long for
 *    a column beside an 8px dot.
 *  - `Intl.RelativeTimeFormat`: it fuses the unit and the "ago" into ONE
 *    literal part in most locales, so there is no part filter that strips the
 *    scaffolding — only a per-language regex, which is a list that silently
 *    stops covering the locales nobody tested.
 *
 *  `Intl.NumberFormat` with `style: 'unit'` formats the quantity and nothing
 *  else, correctly, in every locale the runtime knows. Every row here is in
 *  the past, so the direction never needed saying. */
function signalTime(iso: string, locale: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const units: [Intl.NumberFormatOptions['unit'], number][] = [
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
  ];
  for (const [unit, span] of units) {
    const n = Math.floor(ms / span);
    if (n >= 1) {
      return new Intl.NumberFormat(locale, {
        style: 'unit',
        unit,
        unitDisplay: 'short',
      }).format(n);
    }
  }
  return '';
}

function Bullet({ item }: { item: InboxItem }) {
  // A face beats a letter: when the alert is about a person and we have their
  // avatar, the avatar IS the round 32px bullet the spec draws. Falling back
  // to a "P" bullet for someone who has a picture would be a downgrade.
  //
  // Either way the mark is aria-hidden. It is a second rendering of what the
  // row's own title already says, and RouteBullet is `role="img"` with a
  // required name — left to itself it reads the raw subtype aloud
  // ("submission_update") before every title. Hiding the subtree is safe here
  // because nothing inside it is focusable; the button's name comes from the
  // title text.
  return (
    <span aria-hidden="true" className="shrink-0">
      {item.avatar_url ? (
        <Avatar style={{ height: 32, width: 32 }}>
          <AvatarImage src={item.avatar_url} alt="" />
          <AvatarFallback>{item.title?.charAt(0)?.toUpperCase() || '·'}</AvatarFallback>
        </Avatar>
      ) : (
        <RouteBullet type={SIGNAL_ENTITY[item.subtype] ?? item.subtype} size={32} />
      )}
    </span>
  );
}

function SignalRow({ item, onSelect }: { item: InboxItem; onSelect: (i: InboxItem) => void }) {
  const { t, i18n } = useTranslation();
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className="flex w-full items-start gap-2.5 rounded-element px-2.5 py-2.5 text-left transition-colors hover:bg-surface-container"
    >
      <Bullet item={item} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">{item.title}</span>
        {item.preview && (
          <span className="mt-0.5 block truncate text-13 text-muted-foreground">
            {item.preview}
          </span>
        )}
      </span>
      <span className="mt-0.5 flex shrink-0 items-center gap-2">
        <span className="text-2xs text-muted-foreground">{signalTime(item.ts, i18n.language)}</span>
        {/* Rule 2. Border-gated like every other track-coloured mark on paper
            (WCAG 1.4.11) — see TrackSwatch for why the rim exists. */}
        {/* The read state keeps the slot — and the transparent rim — so the
            two states are the same width and the times above each other stay
            in one column. */}
        <span
          className={cn(
            'border h-2 w-2 rounded-full',
            item.unread ? 'border-track-ring bg-track-pink' : 'border-transparent',
          )}
        >
          {item.unread && (
            <span className="sr-only">{t('inbox.unread', { defaultValue: 'Unread' })}</span>
          )}
        </span>
      </span>
    </button>
  );
}

export function SignalPanel() {
  const { t } = useTranslation();
  // Alerts lens only: the bell is for notifications; chats and mail live in
  // /hub/messages and are not duplicated in a popover.
  const { items, loading } = useInboxFeed('alerts');
  const navigate = useLocalizedNavigate();
  const queryClient = useQueryClient();

  const { safety, rows } = useMemo(() => {
    const safetyItems = items.filter((i) => SAFETY_SUBTYPES.has(i.subtype));
    return {
      safety: safetyItems,
      rows: items.filter((i) => !SAFETY_SUBTYPES.has(i.subtype)).slice(0, 8),
    };
  }, [items]);

  const markAllRead = async () => {
    await untypedRpc('mark_all_alerts_read');
    void queryClient.invalidateQueries({ queryKey: ['inbox-feed'] });
    void queryClient.invalidateQueries({ queryKey: ['inbox-unread'] });
  };

  return (
    <div className="w-full">
      {/* Rank 4 is Space Grotesk 700, never Anton (rankFourFace.test.ts) —
          which is why this does not carry `font-display` despite the mock
          setting it in Anton at the same size. */}
      <div className="flex items-center justify-between gap-4 px-4 pb-2 pt-4">
        <h2 className="text-title font-bold leading-none">
          {t('inbox.signal', { defaultValue: 'Signal' })}
        </h2>
        <button
          type="button"
          onClick={markAllRead}
          className="text-2xs font-bold text-muted-foreground transition-colors hover:text-foreground"
        >
          {t('inbox.markAllRead', { defaultValue: 'Mark all read' })}
        </button>
      </div>

      {/* Rule 1 — above the list, on ink, never a row. */}
      {safety.map((item) => (
        <div key={item.id} className="px-4 pb-2">
          <button
            type="button"
            onClick={() => navigate(item.open_target)}
            className="flex w-full items-start gap-2.5 rounded-element bg-foreground px-2.5 py-2.5 text-left text-background"
          >
            <TrackSwatch track="pink" tone="ink" className="mt-1.5" />
            <span className="min-w-0 flex-1 text-13 leading-snug">
              <strong>{item.title}</strong>
              {item.preview ? <> · {item.preview}</> : null}
            </span>
          </button>
        </div>
      ))}

      {loading ? (
        <p className="px-4 py-6 text-center text-13 text-muted-foreground">
          {t('inbox.loading', { defaultValue: 'Loading…' })}
        </p>
      ) : rows.length === 0 ? (
        // "No X yet." — never a metaphor.
        <p className="px-4 py-6 text-center text-13 text-muted-foreground">
          {t('inbox.empty', { defaultValue: 'Nothing new yet' })}
        </p>
      ) : (
        <ScrollArea style={{ maxHeight: 384 }}>
          <div className="flex flex-col gap-0.5 px-1.5 pb-2">
            {rows.map((item) => (
              <SignalRow key={item.id} item={item} onSelect={(i) => navigate(i.open_target)} />
            ))}
          </div>
        </ScrollArea>
      )}

      {/* The spec's closing strip: "The footer says when the app will not ping
          you, on every open." There is no quiet-hours model in this product
          yet — no column, no RPC, nothing — so the strip carries the half that
          is true. Inventing "Quiet hours 23:00–09:00" would be a promise the
          notifier does not keep. */}
      <div className="flex items-center justify-between gap-2 rounded-b-container bg-surface-container px-4 py-2.5 text-2xs font-bold">
        <LocalizedLink
          to="/hub/messages?filter=alerts"
          className="text-muted-foreground no-underline transition-colors hover:text-foreground"
        >
          {t('inbox.openAlerts', { defaultValue: 'All notifications' })}
        </LocalizedLink>
        <LocalizedLink
          to="/settings?section=notifications"
          className="text-foreground no-underline hover:underline"
        >
          {t('inbox.notificationSettings', { defaultValue: 'Notification settings' })}
        </LocalizedLink>
      </div>
    </div>
  );
}
