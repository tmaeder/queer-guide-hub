-- Create group posts table
CREATE TABLE public.group_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.community_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  post_type TEXT NOT NULL DEFAULT 'text' CHECK (post_type IN ('text', 'announcement', 'poll')),
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  likes_count INTEGER NOT NULL DEFAULT 0,
  comments_count INTEGER NOT NULL DEFAULT 0,
  poll_data JSONB DEFAULT NULL, -- For storing poll options and settings
  images TEXT[] DEFAULT NULL,
  mentions JSONB DEFAULT '[]'::jsonb, -- Array of mentioned user IDs and usernames
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create group post comments table
CREATE TABLE public.group_post_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.group_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  parent_comment_id UUID DEFAULT NULL REFERENCES public.group_post_comments(id) ON DELETE CASCADE,
  likes_count INTEGER NOT NULL DEFAULT 0,
  mentions JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create group post likes table
CREATE TABLE public.group_post_likes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.group_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id)
);

-- Create group comment likes table
CREATE TABLE public.group_comment_likes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  comment_id UUID NOT NULL REFERENCES public.group_post_comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(comment_id, user_id)
);

-- Create poll votes table
CREATE TABLE public.group_poll_votes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.group_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  option_index INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id) -- One vote per user per poll
);

-- Create group notifications table
CREATE TABLE public.group_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.community_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('mention', 'new_post', 'new_announcement', 'new_poll', 'post_liked', 'comment_liked')),
  related_post_id UUID DEFAULT NULL REFERENCES public.group_posts(id) ON DELETE CASCADE,
  related_comment_id UUID DEFAULT NULL REFERENCES public.group_post_comments(id) ON DELETE CASCADE,
  triggered_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT DEFAULT NULL,
  read_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all new tables
ALTER TABLE public.group_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_comment_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for group_posts
CREATE POLICY "Group members can view posts" ON public.group_posts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.group_memberships gm
      WHERE gm.group_id = group_posts.group_id 
      AND gm.user_id = auth.uid()
    )
  );

CREATE POLICY "Group members can create posts" ON public.group_posts
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.group_memberships gm
      WHERE gm.group_id = group_posts.group_id 
      AND gm.user_id = auth.uid()
    )
  );

CREATE POLICY "Post authors can update their posts" ON public.group_posts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Post authors and group admins can delete posts" ON public.group_posts
  FOR DELETE USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM public.group_memberships gm
      WHERE gm.group_id = group_posts.group_id 
      AND gm.user_id = auth.uid()
      AND gm.role IN ('admin', 'moderator')
    )
  );

-- RLS Policies for group_post_comments
CREATE POLICY "Group members can view comments" ON public.group_post_comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.group_posts gp
      JOIN public.group_memberships gm ON gp.group_id = gm.group_id
      WHERE gp.id = group_post_comments.post_id 
      AND gm.user_id = auth.uid()
    )
  );

CREATE POLICY "Group members can create comments" ON public.group_post_comments
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.group_posts gp
      JOIN public.group_memberships gm ON gp.group_id = gm.group_id
      WHERE gp.id = group_post_comments.post_id 
      AND gm.user_id = auth.uid()
    )
  );

CREATE POLICY "Comment authors can update their comments" ON public.group_post_comments
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Comment authors and group admins can delete comments" ON public.group_post_comments
  FOR DELETE USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM public.group_posts gp
      JOIN public.group_memberships gm ON gp.group_id = gm.group_id
      WHERE gp.id = group_post_comments.post_id 
      AND gm.user_id = auth.uid()
      AND gm.role IN ('admin', 'moderator')
    )
  );

-- RLS Policies for likes and votes (similar pattern)
CREATE POLICY "Group members can manage post likes" ON public.group_post_likes
  FOR ALL USING (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.group_posts gp
      JOIN public.group_memberships gm ON gp.group_id = gm.group_id
      WHERE gp.id = group_post_likes.post_id 
      AND gm.user_id = auth.uid()
    )
  );

CREATE POLICY "Group members can manage comment likes" ON public.group_comment_likes
  FOR ALL USING (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.group_post_comments gpc
      JOIN public.group_posts gp ON gpc.post_id = gp.id
      JOIN public.group_memberships gm ON gp.group_id = gm.group_id
      WHERE gpc.id = group_comment_likes.comment_id 
      AND gm.user_id = auth.uid()
    )
  );

CREATE POLICY "Group members can manage poll votes" ON public.group_poll_votes
  FOR ALL USING (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.group_posts gp
      JOIN public.group_memberships gm ON gp.group_id = gm.group_id
      WHERE gp.id = group_poll_votes.post_id 
      AND gm.user_id = auth.uid()
    )
  );

-- RLS Policies for group notifications
CREATE POLICY "Users can view their group notifications" ON public.group_notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can create notifications" ON public.group_notifications
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update their notifications" ON public.group_notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- Create functions to handle post interactions

-- Function to update post likes count
CREATE OR REPLACE FUNCTION public.update_group_post_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.group_posts 
    SET likes_count = likes_count + 1 
    WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.group_posts 
    SET likes_count = GREATEST(likes_count - 1, 0)
    WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update comment likes count
CREATE OR REPLACE FUNCTION public.update_group_comment_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.group_post_comments 
    SET likes_count = likes_count + 1 
    WHERE id = NEW.comment_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.group_post_comments 
    SET likes_count = GREATEST(likes_count - 1, 0)
    WHERE id = OLD.comment_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update post comments count
CREATE OR REPLACE FUNCTION public.update_group_post_comments_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.group_posts 
    SET comments_count = comments_count + 1 
    WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.group_posts 
    SET comments_count = GREATEST(comments_count - 1, 0)
    WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create notifications for mentions and interactions
CREATE OR REPLACE FUNCTION public.create_group_notification()
RETURNS TRIGGER AS $$
DECLARE
  mention_user_id UUID;
  mention_data JSONB;
  group_id_val UUID;
BEGIN
  -- Get group_id based on the table
  IF TG_TABLE_NAME = 'group_posts' THEN
    group_id_val := NEW.group_id;
  ELSIF TG_TABLE_NAME = 'group_post_comments' THEN
    SELECT gp.group_id INTO group_id_val 
    FROM public.group_posts gp 
    WHERE gp.id = NEW.post_id;
  ELSIF TG_TABLE_NAME = 'group_post_likes' THEN
    SELECT gp.group_id INTO group_id_val 
    FROM public.group_posts gp 
    WHERE gp.id = NEW.post_id;
  END IF;

  -- Handle mentions
  IF NEW.mentions IS NOT NULL AND jsonb_array_length(NEW.mentions) > 0 THEN
    FOR mention_data IN SELECT * FROM jsonb_array_elements(NEW.mentions)
    LOOP
      mention_user_id := (mention_data->>'user_id')::UUID;
      
      IF mention_user_id IS NOT NULL AND mention_user_id != NEW.user_id THEN
        INSERT INTO public.group_notifications (
          group_id, user_id, notification_type, 
          related_post_id, related_comment_id, triggered_by_user_id, content
        ) VALUES (
          group_id_val, mention_user_id, 'mention',
          CASE WHEN TG_TABLE_NAME = 'group_posts' THEN NEW.id ELSE NEW.post_id END,
          CASE WHEN TG_TABLE_NAME = 'group_post_comments' THEN NEW.id ELSE NULL END,
          NEW.user_id,
          CASE WHEN TG_TABLE_NAME = 'group_posts' THEN 'mentioned you in a post' 
               ELSE 'mentioned you in a comment' END
        );
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers
CREATE TRIGGER group_post_likes_count_trigger
  AFTER INSERT OR DELETE ON public.group_post_likes
  FOR EACH ROW EXECUTE FUNCTION public.update_group_post_likes_count();

CREATE TRIGGER group_comment_likes_count_trigger
  AFTER INSERT OR DELETE ON public.group_comment_likes
  FOR EACH ROW EXECUTE FUNCTION public.update_group_comment_likes_count();

CREATE TRIGGER group_post_comments_count_trigger
  AFTER INSERT OR DELETE ON public.group_post_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_group_post_comments_count();

CREATE TRIGGER group_posts_mentions_trigger
  AFTER INSERT ON public.group_posts
  FOR EACH ROW EXECUTE FUNCTION public.create_group_notification();

CREATE TRIGGER group_comments_mentions_trigger
  AFTER INSERT ON public.group_post_comments
  FOR EACH ROW EXECUTE FUNCTION public.create_group_notification();

-- Create indexes for better performance
CREATE INDEX idx_group_posts_group_id ON public.group_posts(group_id);
CREATE INDEX idx_group_posts_user_id ON public.group_posts(user_id);
CREATE INDEX idx_group_posts_created_at ON public.group_posts(created_at DESC);
CREATE INDEX idx_group_posts_pinned ON public.group_posts(group_id, is_pinned, created_at DESC);

CREATE INDEX idx_group_post_comments_post_id ON public.group_post_comments(post_id);
CREATE INDEX idx_group_post_comments_user_id ON public.group_post_comments(user_id);

CREATE INDEX idx_group_notifications_user_id ON public.group_notifications(user_id, read_at, created_at DESC);
CREATE INDEX idx_group_notifications_group_id ON public.group_notifications(group_id);