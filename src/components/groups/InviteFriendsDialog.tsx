import { useState, useMemo } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Check, Copy, UserPlus, Link as LinkIcon } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useUserRelationships } from '@/hooks/useUserRelationships';
import { useGroupInvites } from '@/hooks/useGroupInvites';
import { useFriendProfiles } from '@/hooks/useFriendProfiles';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';

export function InviteFriendsDialog({ groupId }: { groupId: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const { getFriends } = useUserRelationships();
  const { inviteFriends, isInviting, createInviteLink } = useGroupInvites();

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);

  const friendIds = useMemo(() => {
    if (!user) return [] as string[];
    return getFriends().map((r) =>
      r.user_id === user.id ? r.target_user_id : r.user_id,
    );
  }, [getFriends, user]);

  const friends = useFriendProfiles(friendIds, open);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSend = () => {
    if (selected.size === 0) return;
    inviteFriends({ groupId, userIds: Array.from(selected) });
    setSelected(new Set());
    setOpen(false);
  };

  const handleCreateLink = async () => {
    try {
      const url = await createInviteLink(groupId);
      setLink(url);
    } catch (e) {
      toast({
        title: t('groups.invite.linkError', 'Could not create invite link'),
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    }
  };

  const handleCopy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <UserPlus size={16} className="mr-2" />
          {t('groups.invite.cta', 'Invite friends')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('groups.invite.title', 'Invite friends')}</DialogTitle>
          <DialogDescription>
            {t('groups.invite.subtitle', 'Pick friends to invite or share a link.')}
          </DialogDescription>
        </DialogHeader>

        <Command shouldFilter>
          <CommandInput placeholder={t('groups.invite.search', 'Search friends...')} />
          <CommandList>
            <CommandEmpty>
              {friendIds.length === 0
                ? t('groups.invite.noFriends', 'No friends to invite yet.')
                : t('groups.invite.noMatch', 'No friends found.')}
            </CommandEmpty>
            <CommandGroup>
              {friends.map((f) => (
                <CommandItem
                  key={f.user_id}
                  value={f.display_name}
                  onSelect={() => toggle(f.user_id)}
                  className="flex items-center gap-2"
                >
                  <Avatar style={{ height: 32, width: 32 }}>
                    <AvatarImage src={f.avatar_url || undefined} />
                    <AvatarFallback>{f.display_name.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="flex-1">{f.display_name}</span>
                  {selected.has(f.user_id) && <Check size={16} className="text-foreground" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>

        <Button onClick={handleSend} disabled={selected.size === 0 || isInviting}>
          {isInviting
            ? t('groups.invite.sending', 'Sending...')
            : t('groups.invite.send', 'Send {{count}} invites', { count: selected.size })}
        </Button>

        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <span className="text-sm font-medium flex items-center gap-2">
            <LinkIcon size={16} />
            {t('groups.invite.shareLink', 'Share an invite link')}
          </span>
          {link ? (
            <div className="flex gap-2">
              <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
              <Button variant="outline" onClick={handleCopy} aria-label={t('common.copy', 'Copy')}>
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </Button>
            </div>
          ) : (
            <Button variant="outline" onClick={handleCreateLink}>
              {t('groups.invite.createLink', 'Create invite link')}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
