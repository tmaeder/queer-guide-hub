import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { Share2, Link2, Send, MessageCircle } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { shareOrCopy, buildShareUrl, SHARE_TARGETS, type ShareOptions } from '@/lib/share';
import { platformIcon } from '@/lib/social/icons';
import { useAuth } from '@/hooks/useAuth';
import { ShareEntityDialog } from '@/components/messaging/ShareEntityDialog';
import type { EntityShareMeta } from '@/components/messaging/chat/entityShare';

interface ShareMenuProps extends ShareOptions {
  size?: 'sm' | 'default';
  variant?: 'outline' | 'ghost';
  label?: string;
  /** Icon-only trigger; `label` becomes its accessible name. */
  iconOnly?: boolean;
  /**
   * When set, signed-in users get a "Send to member" entry that shares this
   * entity in-app as an `entity_share` chat card (or a group post).
   */
  entity?: Omit<EntityShareMeta, 'kind'>;
}

/**
 * Outbound share affordance: native share / copy link + explicit share-to-social
 * targets (X, Bluesky, Facebook, WhatsApp, Telegram, Reddit). Plain intent URLs,
 * no tracking pixels. Monochrome, registry-driven icons.
 */
export function ShareMenu({
  url,
  title,
  text,
  size = 'sm',
  variant = 'outline',
  label,
  iconOnly = false,
  entity,
}: ShareMenuProps) {
  const { t } = useTranslation();
  const triggerLabel = label ?? t('entityActions.share', 'Share');
  const { user } = useAuth();
  const [sendOpen, setSendOpen] = useState(false);
  const opts: ShareOptions = { url, title, text };
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const canSendInApp = !!entity && !!user;
  // Safety-gated places (criminalising countries) are signed-in only on Queer
  // Guide. Broadcasting one to Bluesky/X/… would publish it to everyone, so
  // only private routes stay: copy link and send to a member.
  const publicShare = !entity?.gated;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={variant}
            size={size}
            aria-label={iconOnly ? triggerLabel : undefined}
            title={iconOnly ? triggerLabel : undefined}
            className={iconOnly ? 'w-11 px-0' : undefined}
          >
            <Share2 size={14} className={iconOnly ? undefined : 'mr-1.5'} />
            {!iconOnly && triggerLabel}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {canSendInApp && (
            <>
              <DropdownMenuItem onSelect={() => setSendOpen(true)}>
                <MessageCircle size={16} className="mr-2" />
                {t('entityActions.sendToMember', 'Send to member…')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {publicShare && canNativeShare && (
            <DropdownMenuItem onSelect={() => void shareOrCopy(opts)}>
              <Send size={16} className="mr-2" />
              {t('entityActions.nativeShare', 'Share…')}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => void navigator.clipboard?.writeText(url)}>
            <Link2 size={16} className="mr-2" />
            {t('entityActions.copyLink', 'Copy link')}
          </DropdownMenuItem>
          {publicShare ? (
            <DropdownMenuSeparator />
          ) : (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              {t(
                'entityActions.privateOnly',
                'Public sharing is off for places in countries that criminalise queer people.',
              )}
            </p>
          )}
          {publicShare &&
            SHARE_TARGETS.map(({ target, label: tLabel, platformKey }) => {
              const Icon = platformIcon(platformKey);
              return (
                <DropdownMenuItem key={target} asChild>
                  <a href={buildShareUrl(target, opts)} target="_blank" rel="noopener noreferrer">
                    <Icon size={16} className="mr-2" />
                    {tLabel}
                  </a>
                </DropdownMenuItem>
              );
            })}
        </DropdownMenuContent>
      </DropdownMenu>
      {canSendInApp && entity && (
        <ShareEntityDialog open={sendOpen} onOpenChange={setSendOpen} entity={entity} />
      )}
    </>
  );
}
