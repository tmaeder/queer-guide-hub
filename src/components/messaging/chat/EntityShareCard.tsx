import { ArrowRight, Lock } from 'lucide-react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { EntityShareMeta } from '@/components/messaging/chat/entityShare';

/** Monochrome chat card for a shared live entity. Whole card links to the entity. */
export function EntityShareCard({ meta, note }: { meta: EntityShareMeta; note?: string | null }) {
  const { t } = useTranslation();
  const showNote = note && note.trim() && note.trim() !== meta.title;
  return (
    <div className="flex flex-col gap-1">
      {showNote && <p className="text-sm whitespace-pre-wrap break-words px-2">{note}</p>}
      <Link
        to={meta.path}
        className="flex items-center gap-2 rounded-element border border-border bg-card px-2 py-2 hover:bg-muted/50 transition-colors"
        style={{ minWidth: 220 }}
      >
        {meta.image_url && !meta.gated ? (
          <img
            src={meta.image_url}
            alt=""
            className="rounded-element object-cover shrink-0"
            style={{ width: 44, height: 44 }}
          />
        ) : (
          <div
            className="rounded-element bg-muted flex items-center justify-center shrink-0"
            style={{ width: 44, height: 44 }}
          >
            {meta.gated ? <Lock size={16} className="text-muted-foreground" /> : <ArrowRight size={16} className="text-muted-foreground" />}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate text-foreground">{meta.title}</p>
          <p className="text-xs text-muted-foreground truncate">
            {meta.gated
              ? t('chat.share.gated', { defaultValue: 'Details on Queer Guide' })
              : meta.subtitle || t('chat.share.view', { defaultValue: 'View on Queer Guide' })}
          </p>
        </div>
        <ArrowRight size={14} className="shrink-0 text-muted-foreground" />
      </Link>
    </div>
  );
}
