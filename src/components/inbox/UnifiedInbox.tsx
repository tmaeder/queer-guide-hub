import React, { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Mail,
  Inbox as InboxIcon,
  Send,
  FileText,
  Trash2,
  Archive,
  Search,
  PenSquare,
  Bell,
  ChevronLeft,
  Loader2,
} from 'lucide-react';
import { useUnifiedInbox, type InboxItemType } from '@/hooks/useUnifiedInbox';
import { useMailboxAddress } from '@/hooks/useMailboxAddress';
import { useAuth } from '@/hooks/useAuth';
import { type MailboxFolder } from '@/hooks/useMailbox';
import { EmailView } from './EmailView';
import { ComposeEmail } from './ComposeEmail';
import { MailboxSettings } from './MailboxSettings';
import { InboxItemList } from './InboxItemList';

const FOLDERS: { key: MailboxFolder; label: string; icon: React.ElementType }[] = [
  { key: 'inbox', label: 'Inbox', icon: InboxIcon },
  { key: 'sent', label: 'Sent', icon: Send },
  { key: 'drafts', label: 'Drafts', icon: FileText },
  { key: 'archive', label: 'Archive', icon: Archive },
  { key: 'trash', label: 'Trash', icon: Trash2 },
];

const TYPE_FILTERS: { key: InboxItemType | 'all'; label: string; icon: React.ElementType }[] = [
  { key: 'all', label: 'All', icon: InboxIcon },
  { key: 'email', label: 'Email', icon: Mail },
  { key: 'notification', label: 'Alerts', icon: Bell },
];

export const UnifiedInbox: React.FC = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedEmailId = searchParams.get('email');
  const showCompose = searchParams.get('compose') === 'true';
  const showSettings = searchParams.get('settings') === 'true';

  const [typeFilter, setTypeFilter] = useState<InboxItemType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const { items, totalUnread, mailbox, loading } = useUnifiedInbox(typeFilter);
  const { currentAddress } = useMailboxAddress();

  const folderItems =
    mailbox.selectedFolder !== 'inbox' ? items.filter((i) => i.type === 'email') : items;

  const filteredItems = searchQuery
    ? folderItems.filter(
        (i) =>
          i.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          i.from.toLowerCase().includes(searchQuery.toLowerCase()) ||
          i.snippet.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : folderItems;

  const selectEmail = (id: string) => {
    setSearchParams({ email: id });
    const item = items.find((i) => i.id === id);
    if (item && !item.isRead && item.type === 'email') {
      mailbox.markRead(id);
    }
  };

  const clearSelection = () => {
    setSearchParams({});
  };

  const openCompose = () => setSearchParams({ compose: 'true' });
  const closeCompose = () => setSearchParams({});
  const openSettings = () => setSearchParams({ settings: 'true' });
  const closeSettings = () => setSearchParams({});

  if (!user) {
    return (
      <div className="container mx-auto py-8 px-4">
        <p>Please sign in to access your inbox.</p>
      </div>
    );
  }

  if (showSettings) {
    return (
      <div className="container mx-auto py-8 px-4">
        <Button variant="ghost" onClick={closeSettings} className="mb-4">
          <ChevronLeft className="h-4 w-4 mr-1" /> Back to Inbox
        </Button>
        <MailboxSettings />
      </div>
    );
  }

  if (showCompose) {
    return (
      <div className="container mx-auto py-8 px-4">
        <Button variant="ghost" onClick={closeCompose} className="mb-4">
          <ChevronLeft className="h-4 w-4 mr-1" /> Back to Inbox
        </Button>
        <ComposeEmail onSent={closeCompose} onCancel={closeCompose} />
      </div>
    );
  }

  if (selectedEmailId) {
    const selectedItem = items.find((i) => i.id === selectedEmailId);
    return (
      <div className="container mx-auto py-8 px-4">
        <Button variant="ghost" onClick={clearSelection} className="mb-4">
          <ChevronLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        {selectedItem?.type === 'email' ? (
          <EmailView
            email={selectedItem.raw}
            onReply={(email) => setSearchParams({ compose: 'true', replyTo: email.id })}
            onDelete={(id) => {
              mailbox.moveToFolder(id, 'trash');
              clearSelection();
            }}
            onArchive={(id) => {
              mailbox.moveToFolder(id, 'archive');
              clearSelection();
            }}
          />
        ) : (
          <Card className="p-6">
            <h6 className="text-base font-semibold">{selectedItem?.title}</h6>
            <p className="text-sm text-muted-foreground mt-1">{selectedItem?.snippet}</p>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h5 className="text-xl font-bold">
            <Mail className="inline-block mr-2 align-middle" size={24} />
            Inbox
          </h5>
          {currentAddress && (
            <p className="text-sm text-muted-foreground mt-1">
              {currentAddress}@queer.guide
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {!currentAddress && (
            <Button variant="outline" size="sm" onClick={openSettings}>
              Claim Email Address
            </Button>
          )}
          {currentAddress && (
            <Button size="sm" onClick={openCompose}>
              <PenSquare className="h-4 w-4 mr-1" /> Compose
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-1 mb-4 flex-wrap">
        {FOLDERS.map((f) => (
          <Button
            key={f.key}
            variant={mailbox.selectedFolder === f.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => mailbox.setSelectedFolder(f.key)}
          >
            <f.icon className="h-3.5 w-3.5 mr-1" />
            {f.label}
            {f.key === 'inbox' && totalUnread > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-xs">
                {totalUnread}
              </Badge>
            )}
          </Button>
        ))}
      </div>

      {mailbox.selectedFolder === 'inbox' && (
        <div className="flex gap-1 mb-4">
          {TYPE_FILTERS.map((t) => (
            <Button
              key={t.key}
              variant={typeFilter === t.key ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setTypeFilter(t.key)}
            >
              <t.icon className="h-3.5 w-3.5 mr-1" />
              {t.label}
            </Button>
          ))}
        </div>
      )}

      <div className="relative mb-4">
        <Search
          className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground"
          size={16}
        />
        <Input
          placeholder="Search emails..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-16">
          <Mail className="mx-auto h-12 w-12 text-muted-foreground mb-2" />
          <p className="text-muted-foreground">
            {searchQuery ? 'No results found' : 'No emails in this folder'}
          </p>
        </div>
      ) : (
        <InboxItemList
          items={filteredItems}
          onSelect={selectEmail}
          onToggleStar={(id) => mailbox.toggleStar(id)}
        />
      )}
    </div>
  );
};
