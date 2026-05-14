-- Create user relationships table for friends and blocks
CREATE TABLE public.user_relationships (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    target_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    relationship_type TEXT NOT NULL CHECK (relationship_type IN ('friend', 'block')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(user_id, target_user_id)
);

-- Enable RLS
ALTER TABLE public.user_relationships ENABLE ROW LEVEL SECURITY;

-- Users can view relationships they are involved in
CREATE POLICY "Users can view their relationships" 
ON public.user_relationships 
FOR SELECT 
USING (auth.uid() = user_id OR auth.uid() = target_user_id);

-- Users can create relationships (send friend requests or block)
CREATE POLICY "Users can create relationships" 
ON public.user_relationships 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Users can update relationships they received (accept/reject friend requests)
CREATE POLICY "Users can update received relationships" 
ON public.user_relationships 
FOR UPDATE 
USING (auth.uid() = target_user_id);

-- Users can delete relationships they created
CREATE POLICY "Users can delete their relationships" 
ON public.user_relationships 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_user_relationships_updated_at
BEFORE UPDATE ON public.user_relationships
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_user_relationships_user_id ON public.user_relationships(user_id);
CREATE INDEX idx_user_relationships_target_user_id ON public.user_relationships(target_user_id);
CREATE INDEX idx_user_relationships_type_status ON public.user_relationships(relationship_type, status);