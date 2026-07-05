import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Search, Send, Check } from 'lucide-react';
import {
  fetchSendEventMembers,
  fetchSendEventGroups,
  postEventToGroup,
  type SendEventMemberOption as MemberOption,
  type SendEventGroupOption as GroupOption,
} from '@/hooks/useSendEventDialog';
import { useMessaging } from '@/hooks/useMessaging';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import type { EntityShareMeta } from '@/components/messaging/chat/entityShare';

interface ShareEntityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: Omit<EntityShareMeta, 'kind'>;
}

/**
 * Share a live entity (event, venue, …) to a member (as an entity_share chat
 * card) or a group (as a text post — group_posts has no metadata).
 */
export function ShareEntityDialog({ open, onOpenChange, entity }: ShareEntityDialogProps) {
  const { user } = useAuth();
  const { startConversation, sendMessage } = useMessaging();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<'member' | 'group'>('member');
  const [search, setSearch] = useState('');
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [selectedMember, setSelectedMember] = useState<MemberOption | null>(null);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<GroupOption | null>(null);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
    setSelectedMember(null);
    setSelectedGroup(null);
    setNote('');
    setSearch('');
    setActiveTab('member');
    // eslint-disable-next-line react-hooks/immutability -- fetchMembers/fetchGroups declared below; effect fires after render so bindings are initialized.
    fetchMembers('');
    // eslint-disable-next-line react-hooks/immutability -- see above.
    fetchGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user]);

  const fetchMembers = async (query: string) => {
    if (!user) return;
    setLoadingMembers(true);
    try {
      setMembers(await fetchSendEventMembers(user.id, query));
    } finally {
      setLoadingMembers(false);
    }
  };

  const fetchGroups = async () => {
    if (!user) return;
    setLoadingGroups(true);
    try {
      setGroups(await fetchSendEventGroups(user.id));
    } finally {
      setLoadingGroups(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => fetchMembers(search), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, open]);

  const shareMeta = (): EntityShareMeta => ({
    kind: 'entity_share',
    entity_table: entity.entity_table ?? null,
    entity_id: entity.entity_id ?? null,
    title: entity.title,
    subtitle: entity.gated ? null : (entity.subtitle ?? null),
    image_url: entity.gated ? null : (entity.image_url ?? null),
    path: entity.path,
    gated: !!entity.gated,
  });

  const buildTextMessage = () => {
    const url = `${window.location.origin}${entity.path}`;
    const parts = [
      `📅 ${entity.title}`,
      ...(entity.gated ? [] : [entity.subtitle].filter(Boolean) as string[]),
      url,
    ];
    if (note.trim()) parts.push('', note.trim());
    return parts.join('\n');
  };

  const handleSend = async () => {
    if (!selectedMember || !user) return;
    setSending(true);
    try {
      const conversationId = await startConversation(selectedMember.id);
      if (!conversationId) throw new Error('Failed to create conversation');
      await sendMessage(
        conversationId,
        note.trim() || entity.title,
        undefined,
        'entity_share',
        shareMeta() as unknown as Record<string, unknown>,
      );
      toast({
        title: 'Sent',
        description: `Sent to ${selectedMember.display_name || 'member'}`,
      });
      onOpenChange(false);
    } catch {
      toast({ title: 'Error', description: 'Failed to send', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const handleSendToGroup = async () => {
    if (!selectedGroup || !user) return;
    setSending(true);
    try {
      await postEventToGroup(selectedGroup.id, user.id, buildTextMessage());
      toast({ title: 'Posted', description: `Shared to ${selectedGroup.name}` });
      onOpenChange(false);
    } catch {
      toast({ title: 'Error', description: 'Failed to share', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const initials = (name: string | null) =>
    (name || '?')
      .split(' ')
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

  const renderRow = (
    id: string,
    name: string | null,
    avatarUrl: string | null,
    selected: boolean,
    onSelect: () => void,
  ) => (
    <div
      key={id}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      role="option"
      tabIndex={0}
      aria-selected={selected}
      className={`flex items-center gap-4 px-4 py-2 rounded cursor-pointer ${selected ? 'bg-accent' : 'hover:bg-muted'}`}
    >
      <Avatar style={{ width: 36, height: 36 }}>
        <AvatarImage src={avatarUrl || undefined} />
        <AvatarFallback>{initials(name)}</AvatarFallback>
      </Avatar>
      <p className="text-sm flex-1">{name || 'Anonymous'}</p>
      {selected && <Check size={16} style={{ color: 'hsl(var(--primary))' }} />}
    </div>
  );

  const canSend = activeTab === 'member' ? !!selectedMember : !!selectedGroup;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share</DialogTitle>
          <DialogDescription>Send this to a member or post it to a group</DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'member' | 'group')}>
          <TabsList style={{ width: '100%' }} className="mt-2">
            <TabsTrigger value="member" style={{ flex: 1 }}>
              Member
            </TabsTrigger>
            <TabsTrigger value="group" style={{ flex: 1 }}>
              Group
            </TabsTrigger>
          </TabsList>

          <TabsContent value="member">
            <div className="relative mt-4">
              <Search
                style={{
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 16,
                  height: 16,
                }}
                className="absolute text-muted-foreground"
              />
              <Input
                placeholder="Search members..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ paddingLeft: 36 }}
              />
            </div>
            <ScrollArea style={{ height: 220 }} className="mt-2">
              {loadingMembers && members.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>
              ) : members.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No members found</p>
              ) : (
                members.map((m) =>
                  renderRow(m.id, m.display_name, m.avatar_url, selectedMember?.id === m.id, () =>
                    setSelectedMember(selectedMember?.id === m.id ? null : m),
                  ),
                )
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="group">
            <ScrollArea style={{ height: 264 }} className="mt-2">
              {loadingGroups && groups.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>
              ) : groups.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No groups joined yet
                </p>
              ) : (
                groups.map((g) =>
                  renderRow(g.id, g.name, g.image_url, selectedGroup?.id === g.id, () =>
                    setSelectedGroup(selectedGroup?.id === g.id ? null : g),
                  ),
                )
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>

        {canSend && (
          <Input
            placeholder="Add a note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{ marginTop: 8 }}
          />
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={activeTab === 'member' ? handleSend : handleSendToGroup}
            disabled={!canSend || sending}
          >
            <Send size={14} className="mr-1.5" />
            {sending ? 'Sending...' : 'Send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
