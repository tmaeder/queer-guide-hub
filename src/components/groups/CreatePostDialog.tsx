import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  MessageSquare,
  Megaphone,
  BarChart3,
  Plus,
  X,
  Pin,
  AtSign
} from 'lucide-react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface GroupMember {
  user_id: string;
  profiles: {
    display_name: string;
    avatar_url: string;
  };
}

interface CreatePostDialogProps {
  onCreatePost: (data: {
    content: string;
    postType: 'text' | 'announcement' | 'poll';
    isPinned?: boolean;
    pollData?: { question: string; options: string[] };
    mentions?: Array<{ user_id: string; username: string }>;
  }) => void;
  isCreating: boolean;
  groupMembers: GroupMember[];
  canCreateAnnouncement?: boolean;
  canPin?: boolean;
}

export const CreatePostDialog = ({
  onCreatePost,
  isCreating,
  groupMembers,
  canCreateAnnouncement = false,
  canPin = false
}: CreatePostDialogProps) => {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState('');
  const [postType, setPostType] = useState<'text' | 'announcement' | 'poll'>('text');
  const [isPinned, setIsPinned] = useState(false);
  const [mentions, setMentions] = useState<Array<{ user_id: string; username: string }>>([]);
  const [showMentions, setShowMentions] = useState(false);

  // Poll specific states
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [allowMultipleChoice, setAllowMultipleChoice] = useState(false);

  const resetForm = () => {
    setContent('');
    setPostType('text');
    setIsPinned(false);
    setMentions([]);
    setPollQuestion('');
    setPollOptions(['', '']);
    setAllowMultipleChoice(false);
  };

  const handleSubmit = () => {
    if (!content.trim() && postType !== 'poll') return;
    if (postType === 'poll' && (!pollQuestion.trim() || pollOptions.filter(opt => opt.trim()).length < 2)) return;

    const postData: Record<string, unknown> = {
      content: postType === 'poll' ? pollQuestion : content,
      postType,
      mentions
    };

    if (canPin) {
      postData.isPinned = isPinned;
    }

    if (postType === 'poll') {
      postData.pollData = {
        question: pollQuestion,
        options: pollOptions.filter(opt => opt.trim()),
        multiple_choice: allowMultipleChoice
      };
    }

    onCreatePost(postData);
    resetForm();
    setOpen(false);
  };

  const addPollOption = () => {
    if (pollOptions.length < 6) {
      setPollOptions([...pollOptions, '']);
    }
  };

  const removePollOption = (index: number) => {
    if (pollOptions.length > 2) {
      setPollOptions(pollOptions.filter((_, i) => i !== index));
    }
  };

  const updatePollOption = (index: number, value: string) => {
    const newOptions = [...pollOptions];
    newOptions[index] = value;
    setPollOptions(newOptions);
  };

  const handleMentionSelect = (member: GroupMember) => {
    const mention = {
      user_id: member.user_id,
      username: member.profiles.display_name
    };

    if (!mentions.find(m => m.user_id === member.user_id)) {
      setMentions([...mentions, mention]);
      setContent(content + `@${member.profiles.display_name} `);
    }
    setShowMentions(false);
  };

  const removeMention = (userId: string) => {
    const mention = mentions.find(m => m.user_id === userId);
    if (mention) {
      setMentions(mentions.filter(m => m.user_id !== userId));
      setContent(content.replace(`@${mention.username}`, '').trim());
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <MessageSquare style={{ height: 16, width: 16, marginRight: 8 }} />
          New Post
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Post</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-6">
          <Tabs value={postType} onValueChange={(value: string) => setPostType(value as 'text' | 'announcement' | 'poll')}>
            <TabsList className="w-full">
              <TabsTrigger value="text">
                <div className="flex items-center gap-2">
                  <MessageSquare style={{ height: 16, width: 16 }} />
                  Post
                </div>
              </TabsTrigger>

              {canCreateAnnouncement && (
                <TabsTrigger value="announcement">
                  <div className="flex items-center gap-2">
                    <Megaphone style={{ height: 16, width: 16 }} />
                    Announcement
                  </div>
                </TabsTrigger>
              )}

              <TabsTrigger value="poll">
                <div className="flex items-center gap-2">
                  <BarChart3 style={{ height: 16, width: 16 }} />
                  Poll
                </div>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="text">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="content">What's on your mind?</Label>
                  <Textarea
                    id="content"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Share your thoughts with the group..."
                    rows={4}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="announcement">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="announcement-content">Announcement</Label>
                  <Textarea
                    id="announcement-content"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Make an important announcement to the group..."
                    rows={4}
                  />
                  <p className="text-xs text-muted-foreground">
                    Announcements are highlighted and appear at the top of the group feed.
                  </p>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="poll">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="poll-question">Poll Question</Label>
                  <Input
                    id="poll-question"
                    value={pollQuestion}
                    onChange={(e) => setPollQuestion(e.target.value)}
                    placeholder="What would you like to ask the group?"
                  />
                </div>

                <div className="flex flex-col gap-3">
                  <Label>Poll Options</Label>
                  {pollOptions.map((option, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        value={option}
                        onChange={(e) => updatePollOption(index, e.target.value)}
                        placeholder={`Option ${index + 1}`}
                      />
                      {pollOptions.length > 2 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removePollOption(index)}
                        >
                          <X style={{ height: 16, width: 16 }} />
                        </Button>
                      )}
                    </div>
                  ))}

                  {pollOptions.length < 6 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={addPollOption}
                    >
                      <div className="flex items-center gap-2">
                        <Plus style={{ height: 16, width: 16 }} />
                        Add Option
                      </div>
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    id="multiple-choice"
                    checked={allowMultipleChoice}
                    onCheckedChange={setAllowMultipleChoice}
                  />
                  <Label htmlFor="multiple-choice">
                    Allow multiple selections
                  </Label>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {/* Mentions Section */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Label>Mentions</Label>

              <Popover open={showMentions} onOpenChange={setShowMentions}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    <AtSign style={{ height: 16, width: 16, marginRight: 8 }} />
                    Mention Someone
                  </Button>
                </PopoverTrigger>

                <PopoverContent align="end">
                  <Command>
                    <CommandInput placeholder="Search group members..." />
                    <CommandEmpty>No members found.</CommandEmpty>
                    <CommandList>
                      <CommandGroup>
                        {groupMembers.map((member) => (
                          <CommandItem
                            key={member.user_id}
                            value={member.profiles.display_name}
                            onSelect={() => handleMentionSelect(member)}
                          >
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                {member.profiles.display_name.charAt(0)}
                              </div>
                              <span>{member.profiles.display_name}</span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {mentions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {mentions.map((mention) => (
                  <Badge key={mention.user_id} variant="secondary">
                    <div className="flex items-center gap-1">
                      @{mention.username}
                      <button
                        onClick={() => removeMention(mention.user_id)}
                        style={{ marginLeft: 4 }}
                      >
                        <X style={{ height: 12, width: 12 }} />
                      </button>
                    </div>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Post Options */}
          {canPin && (
            <>
              <Separator />
              <div className="flex items-center gap-2">
                <Switch
                  id="pin-post"
                  checked={isPinned}
                  onCheckedChange={setIsPinned}
                />
                <Label htmlFor="pin-post">
                  <div className="flex items-center gap-2">
                    <Pin style={{ height: 16, width: 16 }} />
                    Pin this post to the top
                  </div>
                </Label>
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isCreating || (!content.trim() && postType !== 'poll')}
            >
              {isCreating ? 'Creating...' : 'Create Post'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
