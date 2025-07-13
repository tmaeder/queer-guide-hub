import React from 'react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  Image, 
  Link as LinkIcon, 
  BarChart3, 
  X, 
  Plus,
  Calendar,
  MapPin
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface CreatePostProps {
  onPostCreate: (post: {
    content: string;
    post_type: string;
    tags?: string[];
    images?: string[];
    link_url?: string;
    link_title?: string;
    poll_options?: any;
  }) => void;
  loading?: boolean;
}

export function CreatePost({ onPostCreate, loading }: CreatePostProps) {
  const [content, setContent] = useState('');
  const [postType, setPostType] = useState('text');
  const [tags, setTags] = useState<string[]>([]);
  const [currentTag, setCurrentTag] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [expanded, setExpanded] = useState(false);
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!content.trim()) {
      toast({
        title: "Content required",
        description: "Please write something to share with the community.",
        variant: "destructive",
      });
      return;
    }

    const postData: any = {
      content: content.trim(),
      post_type: postType,
      tags: tags.length > 0 ? tags : undefined,
    };

    if (postType === 'link' && linkUrl) {
      postData.link_url = linkUrl;
      postData.link_title = linkTitle || undefined;
    }

    if (postType === 'poll' && pollOptions.filter(opt => opt.trim()).length >= 2) {
      postData.poll_options = {
        options: pollOptions.filter(opt => opt.trim()),
        votes: new Array(pollOptions.filter(opt => opt.trim()).length).fill(0)
      };
    }

    onPostCreate(postData);

    // Reset form
    setContent('');
    setTags([]);
    setCurrentTag('');
    setLinkUrl('');
    setLinkTitle('');
    setPollOptions(['', '']);
    setExpanded(false);
  };

  const addTag = () => {
    if (currentTag.trim() && !tags.includes(currentTag.trim().toLowerCase())) {
      setTags([...tags, currentTag.trim().toLowerCase()]);
      setCurrentTag('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const addPollOption = () => {
    if (pollOptions.length < 6) {
      setPollOptions([...pollOptions, '']);
    }
  };

  const updatePollOption = (index: number, value: string) => {
    const newOptions = [...pollOptions];
    newOptions[index] = value;
    setPollOptions(newOptions);
  };

  const removePollOption = (index: number) => {
    if (pollOptions.length > 2) {
      setPollOptions(pollOptions.filter((_, i) => i !== index));
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">Share with the community</h3>
          {!expanded && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(true)}
              className="text-muted-foreground"
            >
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Textarea
            placeholder="What's on your mind? Share updates, questions, or connect with the community..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="min-h-[100px]"
            onFocus={() => setExpanded(true)}
          />

          {expanded && (
            <>
              {/* Post Type Selector */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={postType === 'text' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPostType('text')}
                >
                  Text
                </Button>
                <Button
                  type="button"
                  variant={postType === 'link' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPostType('link')}
                >
                  <LinkIcon className="h-4 w-4 mr-1" />
                  Link
                </Button>
                <Button
                  type="button"
                  variant={postType === 'poll' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPostType('poll')}
                >
                  <BarChart3 className="h-4 w-4 mr-1" />
                  Poll
                </Button>
              </div>

              {/* Link Fields */}
              {postType === 'link' && (
                <div className="space-y-2">
                  <Input
                    placeholder="Enter URL..."
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    type="url"
                  />
                  <Input
                    placeholder="Link title (optional)"
                    value={linkTitle}
                    onChange={(e) => setLinkTitle(e.target.value)}
                  />
                </div>
              )}

              {/* Poll Options */}
              {postType === 'poll' && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Poll Options</h4>
                  {pollOptions.map((option, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        placeholder={`Option ${index + 1}`}
                        value={option}
                        onChange={(e) => updatePollOption(index, e.target.value)}
                      />
                      {pollOptions.length > 2 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removePollOption(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  {pollOptions.length < 6 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addPollOption}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Option
                    </Button>
                  )}
                </div>
              )}

              {/* Tags */}
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    placeholder="Add tags (press Enter or click +)"
                    value={currentTag}
                    onChange={(e) => setCurrentTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addTag();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addTag}
                    disabled={!currentTag.trim()}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="cursor-pointer gap-1"
                        onClick={() => removeTag(tag)}
                      >
                        #{tag}
                        <X className="h-3 w-3" />
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Submit Buttons */}
          <div className="flex gap-2 justify-end">
            {expanded && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setExpanded(false)}
              >
                Cancel
              </Button>
            )}
            <Button 
              type="submit" 
              className="bg-gradient-primary"
              disabled={loading || !content.trim()}
            >
              {loading ? 'Posting...' : 'Share Post'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}