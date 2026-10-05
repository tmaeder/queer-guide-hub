import { useState } from 'react';
import { Share2, Link2, Send, MessageCircle } from 'lucide-react';
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
  label = 'Share',
  entity,
}: ShareMenuProps) {
  const { user } = useAuth();
  const [sendOpen, setSendOpen] = useState(false);
  const opts: ShareOptions = { url, title, text };
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const canSendInApp = !!entity && !!user;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant={variant} size={size}>
            <Share2 size={14} className="mr-1.5" />
            {label}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {canSendInApp && (
            <>
              <DropdownMenuItem onSelect={() => setSendOpen(true)}>
                <MessageCircle size={16} className="mr-2" />
                Send to member…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {canNativeShare && (
            <DropdownMenuItem onSelect={() => void shareOrCopy(opts)}>
              <Send size={16} className="mr-2" />
              Share…
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => void navigator.clipboard?.writeText(url)}>
            <Link2 size={16} className="mr-2" />
            Copy link
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {SHARE_TARGETS.map(({ target, label: tLabel, platformKey }) => {
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
