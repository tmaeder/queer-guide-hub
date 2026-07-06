import { useTranslation } from 'react-i18next';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { generateAvatarUrl } from '@/lib/avatar';

type ProfileX = {
  avatar_url?: string | null;
  display_name?: string | null;
  username?: string | null;
} | null;

/**
 * Who-am-I block at the top of the hub's side nav: avatar, name, handle,
 * linking to the own public profile (the identity surface — the hub is the
 * workspace). The vibe/status editor stays in the inbox rail (VibeEditor).
 */
export function HubIdentityBlock() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { profile } = useProfile();
  const px = profile as ProfileX;

  if (!user) return null;

  const avatarSrc =
    px?.avatar_url || (user.email ? generateAvatarUrl(user.email, 96) || undefined : undefined);
  const initial = (px?.username || user.email || 'U').charAt(0).toUpperCase();

  return (
    <LocalizedLink
      to={`/user/${user.id}`}
      className="flex items-center gap-2 rounded-element p-2 no-underline transition-colors hover:bg-muted"
    >
      <Avatar className="h-9 w-9">
        <AvatarImage src={avatarSrc} alt="" />
        <AvatarFallback>{initial}</AvatarFallback>
      </Avatar>
      <span className="flex min-w-0 flex-col">
        {px?.username ? (
          <span className="truncate font-mono text-sm font-semibold">@{px.username}</span>
        ) : (
          <span className="truncate text-sm font-semibold">
            {t('header.userMenu.you', 'You')}
          </span>
        )}
      </span>
    </LocalizedLink>
  );
}
