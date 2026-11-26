import { useTranslation } from 'react-i18next';
import { ArrowRight, PenSquare } from '@/components/icons';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useInboxFeed } from '@/hooks/useInboxFeed';
import { SignalRow } from './SignalPanel';

/** The Messages tab of the Hub menu: latest chats and mail, plus inbox links. */
export function MessagesPeek({ onNavigate }: { onNavigate: () => void }) {
  const { t } = useTranslation();
  const navigate = useLocalizedNavigate();
  const { items, loading } = useInboxFeed('all');
  const rows = items.filter((i) => i.kind !== 'notification').slice(0, 4);

  return (
    <div className="w-full">
      {loading ? (
        <p className="px-4 py-6 text-center text-13 text-muted-foreground">
          {t('inbox.loading', { defaultValue: 'Loading…' })}
        </p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-13 text-muted-foreground">
          {t('inbox.noMessages', { defaultValue: 'No messages yet.' })}
        </p>
      ) : (
        <div className="flex flex-col gap-0.5 px-1.5 py-2">
          {rows.map((item) => (
            <SignalRow
              key={item.id}
              item={item}
              onSelect={(i) => {
                onNavigate();
                navigate(i.open_target);
              }}
            />
          ))}
        </div>
      )}
      <div className="flex items-center justify-between gap-2 rounded-b-container bg-surface-container px-2 py-1.5 text-xs font-bold">
        <LocalizedLink
          to="/messages"
          onClick={onNavigate}
          className="inline-flex min-h-9 items-center gap-1 rounded-badge px-2 no-underline transition-colors hover:bg-surface-container-high"
        >
          {t('inbox.openInbox', { defaultValue: 'Open inbox' })}
          <ArrowRight size={14} aria-hidden />
        </LocalizedLink>
        <LocalizedLink
          to="/messages?compose=message"
          onClick={onNavigate}
          className="inline-flex min-h-9 items-center gap-1 rounded-badge px-2 text-muted-foreground no-underline transition-colors hover:bg-surface-container-high hover:text-foreground"
        >
          <PenSquare size={14} aria-hidden />
          {t('inbox.compose.message', { defaultValue: 'New message' })}
        </LocalizedLink>
      </div>
    </div>
  );
}
