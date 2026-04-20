import { useState } from 'react';
import { buildPostValidationPayload, preSubmitCheck } from './postValidation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFormValidation } from '@/components/security/EnhancedFormValidator';
import { useToast } from '@/hooks/use-toast';
import {
  PenSquare,
  Image as ImageIcon,
  Link as LinkIcon,
  BarChart3,
  Globe,
  Users,
  Lock,
  X,
  Plus,
  AtSign,
  Hash
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
  const { validateFormData } = useFormValidation();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [content, setContent] = useState('');
  const [postType, setPostType] = useState<'text' | 'image' | 'link' | 'poll'>('text');
  const [visibility, setVisibility] = useState<'public' | 'friends' | 'private'>('public');
  const [images, setImages] = useState<string[]>([]);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [linkDescription, setLinkDescription] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [_mentions, setMentions] = useState<Array<{ user_id: string; username: string }>>([]);
  const [_tags, setTags] = useState<string[]>([]);

  const handleSubmit = async () => {
    const preErr = preSubmitCheck(postType, {
      content,
      linkUrl,
      linkTitle,
      linkDescription,
      pollOptions,
    });
    if (preErr) {
      toast({
        title: preErr.field === 'content' ? 'Error' : 'Invalid input',
        description: preErr.message,
        variant: 'destructive',
      });
      return;
    }

    // Type-scoped security validation — avoid false positives like empty
    // pollOptions on a text post.
    const { data: validationData, fields: validationFields } = buildPostValidationPayload(
      postType,
      { content, linkUrl, linkTitle, linkDescription, pollOptions },
    );
    const validation = await validateFormData(validationData, validationFields);
    if (!validation.isValid) {
      toast({
        title: "Content Validation Failed",
        description: validation.errors.join(', '),
        variant: "destructive",
      });
      return;
    }

    // Parse mentions and tags from content
    const mentionMatches = content.match(/@(\w+)/g);
    const tagMatches = content.match(/#(\w+)/g);

    const extractedMentions = mentionMatches?.map(match => ({
      user_id: '', // In a real implementation, you'd look up user IDs
      username: match.substring(1)
    })) || [];

    const extractedTags = tagMatches?.map(match => match.substring(1)) || [];

    const postData: CreatePostData = {
      content: content.trim(),
      post_type: postType,
      visibility,
      mentions: extractedMentions.length > 0 ? extractedMentions : undefined,
      tags: extractedTags.length > 0 ? extractedTags : undefined,
    };

    if (postType === 'image' && images.length > 0) {
      postData.images = images;
    }

    if (postType === 'link' && linkUrl) {
      // Additional URL validation
      try {
        const url = new URL(linkUrl);
        if (!['http:', 'https:'].includes(url.protocol)) {
          toast({
            title: "Invalid URL",
            description: "Only HTTP and HTTPS URLs are allowed",
            variant: "destructive",
          });
          return;
        }
      } catch {
        toast({
          title: "Invalid URL",
          description: "Please enter a valid URL",
          variant: "destructive",
        });
        return;
      }

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

    try {
      await createPost(postData);
      toast({
        title: "Success",
        description: "Post created successfully!",
      });
      handleClose();
    } catch (_error) {
      toast({
        title: "Error",
        description: "Failed to create post. Please try again.",
        variant: "destructive",
      });
    }
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
    setMentions([]);
    setTags([]);
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
      case 'image': return <ImageIcon style={{ height: 16, width: 16 }} />;
      case 'link': return <LinkIcon style={{ height: 16, width: 16 }} />;
      case 'poll': return <BarChart3 style={{ height: 16, width: 16 }} />;
      default: return <PenSquare style={{ height: 16, width: 16 }} />;
    }
  };

  const getVisibilityIcon = () => {
    switch (visibility) {
      case 'friends': return <Users style={{ height: 16, width: 16 }} />;
      case 'private': return <Lock style={{ height: 16, width: 16 }} />;
      default: return <Globe style={{ height: 16, width: 16 }} />;
    }
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button>
            <PenSquare style={{ height: 16, width: 16, marginRight: 8 }} />
            Create Post
          </Button>
        )}
      </DialogTrigger>
      <DialogContent style={{ maxWidth: 672, maxHeight: '80vh', overflowY: 'auto' }}>
        <DialogHeader>
          <DialogTitle>Create a Post</DialogTitle>
        </DialogHeader>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* User Info */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Avatar style={{ height: 40, width: 40 }}>
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback>
                {profile?.display_name?.charAt(0)?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontWeight: 500 }}>{profile?.display_name || 'User'}</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Badge variant="outline" style={{ fontSize: '0.75rem' }}>
                  {getVisibilityIcon()}
                  <span style={{ marginLeft: 4, textTransform: 'capitalize' }}>{visibility}</span>
                </Badge>
                <Badge variant="outline" style={{ fontSize: '0.75rem' }}>
                  {getPostTypeIcon()}
                  <span style={{ marginLeft: 4, textTransform: 'capitalize' }}>{postType}</span>
                </Badge>
              </Box>
            </Box>
          </Box>

          {/* Post Type Selection */}
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1 }}>
            <Button
              variant={postType === 'text' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPostType('text')}
            >
              <PenSquare style={{ height: 16, width: 16, marginRight: 4 }} />
              Text
            </Button>
            <Button
              variant={postType === 'image' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPostType('image')}
            >
              <ImageIcon style={{ height: 16, width: 16, marginRight: 4 }} />
              Image
            </Button>
            <Button
              variant={postType === 'link' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPostType('link')}
            >
              <LinkIcon style={{ height: 16, width: 16, marginRight: 4 }} />
              Link
            </Button>
            <Button
              variant={postType === 'poll' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPostType('poll')}
            >
              <BarChart3 style={{ height: 16, width: 16, marginRight: 4 }} />
              Poll
            </Button>
          </Box>

          {/* Main Content */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Textarea
              placeholder="What's on your mind? Use @ to mention users and # for tags..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              style={{ minHeight: 120, resize: 'none' }}
              maxLength={5000}
            />

            {/* Mention and Tag Hints */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: '0.75rem', color: 'text.secondary' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <AtSign style={{ height: 12, width: 12 }} />
                <span>Type @ to mention users</span>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Hash style={{ height: 12, width: 12 }} />
                <span>Type # to add tags</span>
              </Box>
            </Box>
          </Box>

          {/* Post Type Specific Content */}
          {postType === 'image' && (
            <Card>
              <CardContent style={{ padding: 16 }}>
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
              <CardContent style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
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
              <CardContent style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Label>Poll Options</Label>
                {pollOptions.map((option, index) => (
                  <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
                        <X style={{ height: 16, width: 16 }} />
                      </Button>
                    )}
                  </Box>
                ))}
                {pollOptions.length < 6 && (
                  <Button variant="outline" size="sm" onClick={addPollOption}>
                    <Plus style={{ height: 16, width: 16, marginRight: 4 }} />
                    Add Option
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Visibility Selection */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Label>Post Visibility</Label>
            <Select value={visibility} onValueChange={(value: string) => setVisibility(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Globe style={{ height: 16, width: 16 }} />
                    <span>Public - Anyone can see this post</span>
                  </Box>
                </SelectItem>
                <SelectItem value="friends">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Users style={{ height: 16, width: 16 }} />
                    <span>Friends - Only your connections</span>
                  </Box>
                </SelectItem>
                <SelectItem value="private">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Lock style={{ height: 16, width: 16 }} />
                    <span>Private - Only you can see this</span>
                  </Box>
                </SelectItem>
              </SelectContent>
            </Select>
          </Box>

          {/* Character count */}
          <Box sx={{ textAlign: 'right', fontSize: '0.75rem', color: 'text.secondary' }}>
            {content.length}/5000 characters
          </Box>

          {/* Actions */}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, pt: 2 }}>
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!content.trim() || isCreatingPost}
            >
              {isCreatingPost ? 'Posting...' : 'Post'}
            </Button>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
};
