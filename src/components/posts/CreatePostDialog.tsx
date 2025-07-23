import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  PenSquare, 
  Image as ImageIcon, 
  Link as LinkIcon, 
  BarChart3, 
  Globe, 
  Users, 
  Lock,
  X,
  Plus
} from 'lucide-react';
import { useCommunityPosts, CreatePostData } from '@/hooks/useCommunityPosts';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';

interface CreatePostDialogProps {
  children?: React.ReactNode;
}

export const CreatePostDialog = ({ children }: CreatePostDialogProps) => {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { createPost, isCreatingPost } = useCommunityPosts();
  
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState('');
  const [postType, setPostType] = useState<'text' | 'image' | 'link' | 'poll'>('text');
  const [visibility, setVisibility] = useState<'public' | 'friends' | 'private'>('public');
  const [images, setImages] = useState<string[]>([]);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [linkDescription, setLinkDescription] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);

  const handleSubmit = () => {
    if (!content.trim()) return;

    const postData: CreatePostData = {
      content: content.trim(),
      post_type: postType,
      visibility,
    };

    if (postType === 'image' && images.length > 0) {
      postData.images = images;
    }

    if (postType === 'link' && linkUrl) {
      postData.link_url = linkUrl;
      postData.link_title = linkTitle;
      postData.link_description = linkDescription;
    }

    if (postType === 'poll' && pollOptions.filter(opt => opt.trim()).length >= 2) {
      postData.poll_options = {
        options: pollOptions.filter(opt => opt.trim()),
        multiple_choice: false,
        expires_at: null
      };
    }

    createPost(postData);
    handleClose();
  };

  const handleClose = () => {
    setOpen(false);
    setContent('');
    setPostType('text');
    setVisibility('public');
    setImages([]);
    setLinkUrl('');
    setLinkTitle('');
    setLinkDescription('');
    setPollOptions(['', '']);
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

  const getPostTypeIcon = () => {
    switch (postType) {
      case 'image': return <ImageIcon className="h-4 w-4" />;
      case 'link': return <LinkIcon className="h-4 w-4" />;
      case 'poll': return <BarChart3 className="h-4 w-4" />;
      default: return <PenSquare className="h-4 w-4" />;
    }
  };

  const getVisibilityIcon = () => {
    switch (visibility) {
      case 'friends': return <Users className="h-4 w-4" />;
      case 'private': return <Lock className="h-4 w-4" />;
      default: return <Globe className="h-4 w-4" />;
    }
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button>
            <PenSquare className="h-4 w-4 mr-2" />
            Create Post
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create a Post</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* User Info */}
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback>
                {profile?.display_name?.charAt(0)?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <p className="font-medium">{profile?.display_name || 'User'}</p>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {getVisibilityIcon()}
                  <span className="ml-1 capitalize">{visibility}</span>
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {getPostTypeIcon()}
                  <span className="ml-1 capitalize">{postType}</span>
                </Badge>
              </div>
            </div>
          </div>

          {/* Post Type Selection */}
          <div className="grid grid-cols-4 gap-2">
            <Button
              variant={postType === 'text' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPostType('text')}
            >
              <PenSquare className="h-4 w-4 mr-1" />
              Text
            </Button>
            <Button
              variant={postType === 'image' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPostType('image')}
            >
              <ImageIcon className="h-4 w-4 mr-1" />
              Image
            </Button>
            <Button
              variant={postType === 'link' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPostType('link')}
            >
              <LinkIcon className="h-4 w-4 mr-1" />
              Link
            </Button>
            <Button
              variant={postType === 'poll' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPostType('poll')}
            >
              <BarChart3 className="h-4 w-4 mr-1" />
              Poll
            </Button>
          </div>

          {/* Main Content */}
          <Textarea
            placeholder="What's on your mind?"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="min-h-[120px] resize-none"
            maxLength={2000}
          />

          {/* Post Type Specific Content */}
          {postType === 'image' && (
            <Card>
              <CardContent className="p-4">
                <Label>Image URLs (one per line)</Label>
                <Textarea
                  placeholder="https://example.com/image1.jpg&#10;https://example.com/image2.jpg"
                  value={images.join('\n')}
                  onChange={(e) => setImages(e.target.value.split('\n').filter(url => url.trim()))}
                  rows={3}
                />
              </CardContent>
            </Card>
          )}

          {postType === 'link' && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <div>
                  <Label htmlFor="link-url">Link URL</Label>
                  <Input
                    id="link-url"
                    placeholder="https://example.com"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="link-title">Title (optional)</Label>
                  <Input
                    id="link-title"
                    placeholder="Link title"
                    value={linkTitle}
                    onChange={(e) => setLinkTitle(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="link-desc">Description (optional)</Label>
                  <Textarea
                    id="link-desc"
                    placeholder="Brief description of the link"
                    value={linkDescription}
                    onChange={(e) => setLinkDescription(e.target.value)}
                    rows={2}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {postType === 'poll' && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <Label>Poll Options</Label>
                {pollOptions.map((option, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      placeholder={`Option ${index + 1}`}
                      value={option}
                      onChange={(e) => updatePollOption(index, e.target.value)}
                    />
                    {pollOptions.length > 2 && (
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => removePollOption(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                {pollOptions.length < 6 && (
                  <Button variant="outline" size="sm" onClick={addPollOption}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Option
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Visibility Selection */}
          <div className="space-y-2">
            <Label>Post Visibility</Label>
            <Select value={visibility} onValueChange={(value: any) => setVisibility(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    <span>Public - Anyone can see this post</span>
                  </div>
                </SelectItem>
                <SelectItem value="friends">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    <span>Friends - Only your connections</span>
                  </div>
                </SelectItem>
                <SelectItem value="private">
                  <div className="flex items-center gap-2">
                    <Lock className="h-4 w-4" />
                    <span>Private - Only you can see this</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Character count */}
          <div className="text-right text-xs text-muted-foreground">
            {content.length}/2000 characters
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={!content.trim() || isCreatingPost}
            >
              {isCreatingPost ? 'Posting...' : 'Post'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};