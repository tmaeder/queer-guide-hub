import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MEETUP_ACTIVITY_ICONS } from '@/config/meetupActivities';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, MapPin } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { ReportContentDialog } from '@/components/moderation/ReportContentDialog';
import type { TravelMeetAction, TravelMeetPlan } from '@/hooks/useTravelMeet';
import { formatMeetDates } from '@/lib/travelMeet';
import { useCurrentLocale } from '@/hooks/useLocalizedNavigate';

export function TravelMeetCard({
  plan,
  busy,
  act,
}: {
  plan: TravelMeetPlan;
  busy: boolean;
  act: (action: TravelMeetAction, id: string) => void;
}) {
  const { t } = useTranslation();
  const locale = useCurrentLocale();
  const client = useQueryClient();
  const [report, setReport] = useState(false);
  const request = plan.request;
  const ActivityIcon = MEETUP_ACTIVITY_ICONS[plan.activity];
  const initials = plan.display_name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((name) => name[0])
    .join('');
  return (
    <article className="h-full min-w-0">
      <Card className="flex h-full flex-col gap-6 p-6">
        <Badge variant="ink" className="w-fit gap-2">
          <ActivityIcon size={18} aria-hidden />
          {t(`travelMeet.activities.${plan.activity}`)}
        </Badge>
        <h3 className="text-2xl font-bold leading-tight tracking-tight break-words sm:text-3xl">
          {plan.title}
        </h3>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <MapPin size={16} aria-hidden />
            {plan.city_name}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays size={16} aria-hidden />
            {formatMeetDates(plan.start_date, plan.end_date, locale)}
          </span>
        </div>
        {plan.description && (
          <p className="max-w-reading whitespace-pre-wrap break-words text-body text-muted-foreground">
            {plan.description}
          </p>
        )}
        <div className="flex items-center gap-4 text-sm">
          <Avatar className="h-10 w-10 shrink-0" aria-hidden>
            <AvatarImage src={plan.avatar_url ?? undefined} alt="" />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 space-y-1">
            <LocalizedLink
              to={`/user/${plan.owner_id}`}
              className="font-semibold underline underline-offset-4 break-words"
            >
              {plan.display_name}
            </LocalizedLink>
            <p className="text-muted-foreground">
              {plan.host_kind === 'local'
                ? t('travelMeet.local', 'Local, happy to meet visitors')
                : t('travelMeet.traveller', 'Visiting your destination')}
            </p>
          </div>
        </div>
        {plan.event_title && plan.event_slug && (
          <LocalizedLink
            className="w-fit underline underline-offset-4"
            to={`/events/${plan.event_slug}`}
          >
            {plan.event_title}
          </LocalizedLink>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
          {!request && (
            <Button disabled={busy} onClick={() => act('request', plan.id)}>
              {t('travelMeet.ask', 'Ask to join')}
            </Button>
          )}
          {request?.status === 'pending' && (
            <>
              <span className="text-sm" role="status">
                {t('travelMeet.pending', 'Waiting for the host to respond')}
              </span>
              <Button variant="outline" disabled={busy} onClick={() => act('withdraw', request.id)}>
                {t('travelMeet.withdraw', 'Withdraw request')}
              </Button>
            </>
          )}
          {request?.status === 'accepted' && request.conversation_id && (
            <Button asChild>
              <LocalizedLink
                className="no-underline"
                to={`/messages?conversation=${request.conversation_id}`}
              >
                {t('travelMeet.message', 'Open conversation')}
              </LocalizedLink>
            </Button>
          )}
          {(request?.status === 'declined' || request?.status === 'withdrawn') && (
            <span className="text-sm text-muted-foreground">
              {request.status === 'declined'
                ? t('travelMeet.declined', 'Request declined')
                : t('travelMeet.withdrawn', 'Request withdrawn')}
            </span>
          )}
          <Button variant="ghost" onClick={() => setReport(true)}>
            {t('travelMeet.report', 'Report or block')}
          </Button>
        </div>
        <ReportContentDialog
          open={report}
          onOpenChange={(open) => {
            setReport(open);
            if (!open) void client.invalidateQueries({ queryKey: ['travel-meet'] });
          }}
          contentType="profile"
          contentId={plan.owner_id}
          targetUserId={plan.owner_id}
        />
      </Card>
    </article>
  );
}
