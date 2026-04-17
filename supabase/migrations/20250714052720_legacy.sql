-- Create community groups table
CREATE TABLE public.community_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  is_private BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  member_count INTEGER NOT NULL DEFAULT 0,
  rules TEXT,
  tags TEXT[]
);

-- Create group memberships table
CREATE TABLE public.group_memberships (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.community_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'member', -- member, moderator, admin
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

-- Enable RLS
ALTER TABLE public.community_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_memberships ENABLE ROW LEVEL SECURITY;

-- RLS policies for community_groups
CREATE POLICY "Public groups are viewable by everyone" 
ON public.community_groups 
FOR SELECT 
USING (is_private = false);

CREATE POLICY "Private groups are viewable by members" 
ON public.community_groups 
FOR SELECT 
USING (
  is_private = true AND EXISTS (
    SELECT 1 FROM public.group_memberships 
    WHERE group_id = community_groups.id AND user_id = auth.uid()
  )
);

CREATE POLICY "Users can view their own groups" 
ON public.community_groups 
FOR SELECT 
USING (auth.uid() = created_by);

CREATE POLICY "Authenticated users can create groups" 
ON public.community_groups 
FOR INSERT 
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Group creators and admins can update groups" 
ON public.community_groups 
FOR UPDATE 
USING (
  auth.uid() = created_by OR EXISTS (
    SELECT 1 FROM public.group_memberships 
    WHERE group_id = community_groups.id 
    AND user_id = auth.uid() 
    AND role = 'admin'
  )
);

CREATE POLICY "Group creators can delete groups" 
ON public.community_groups 
FOR DELETE 
USING (auth.uid() = created_by);

-- RLS policies for group_memberships
CREATE POLICY "Group memberships are viewable by group members" 
ON public.group_memberships 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.group_memberships gm 
    WHERE gm.group_id = group_memberships.group_id 
    AND gm.user_id = auth.uid()
  )
);

CREATE POLICY "Users can join groups" 
ON public.group_memberships 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave groups" 
ON public.group_memberships 
FOR DELETE 
USING (auth.uid() = user_id);

CREATE POLICY "Group admins can manage memberships" 
ON public.group_memberships 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.group_memberships 
    WHERE group_id = group_memberships.group_id 
    AND user_id = auth.uid() 
    AND role IN ('admin', 'moderator')
  )
);

-- Function to update member count
CREATE OR REPLACE FUNCTION update_group_member_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.community_groups 
    SET member_count = member_count + 1 
    WHERE id = NEW.group_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.community_groups 
    SET member_count = member_count - 1 
    WHERE id = OLD.group_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for member count
CREATE TRIGGER update_member_count_trigger
AFTER INSERT OR DELETE ON public.group_memberships
FOR EACH ROW
EXECUTE FUNCTION update_group_member_count();

-- Add updated_at trigger for groups
CREATE TRIGGER update_community_groups_updated_at
BEFORE UPDATE ON public.community_groups
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();