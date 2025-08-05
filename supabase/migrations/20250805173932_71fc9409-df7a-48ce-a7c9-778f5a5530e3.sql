-- Enable the vector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Create content embeddings table for RAG
CREATE TABLE IF NOT EXISTS public.content_embeddings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  content_type TEXT NOT NULL, -- 'venue', 'event', 'tag', 'group', 'marketplace'
  content_id UUID NOT NULL,
  content_text TEXT NOT NULL, -- The actual text content for search
  embedding VECTOR(1536), -- OpenAI embeddings are 1536 dimensions
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for efficient vector search and filtering
CREATE INDEX IF NOT EXISTS idx_content_embeddings_content_type ON public.content_embeddings(content_type);
CREATE INDEX IF NOT EXISTS idx_content_embeddings_content_id ON public.content_embeddings(content_id);
CREATE INDEX IF NOT EXISTS idx_content_embeddings_embedding ON public.content_embeddings USING ivfflat (embedding vector_cosine_ops);

-- Create RLS policies
ALTER TABLE public.content_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Content embeddings are viewable by everyone" 
ON public.content_embeddings 
FOR SELECT 
USING (true);

CREATE POLICY "Admins can manage content embeddings" 
ON public.content_embeddings 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create table for RAG conversation history
CREATE TABLE IF NOT EXISTS public.rag_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  session_id TEXT NOT NULL,
  query TEXT NOT NULL,
  response TEXT NOT NULL,
  context_used JSONB DEFAULT '[]', -- Array of content that was referenced
  embedding VECTOR(1536), -- Query embedding for similarity search
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for conversation history
CREATE INDEX IF NOT EXISTS idx_rag_conversations_user_id ON public.rag_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_rag_conversations_session_id ON public.rag_conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_rag_conversations_created_at ON public.rag_conversations(created_at DESC);

-- Enable RLS for conversations
ALTER TABLE public.rag_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own RAG conversations" 
ON public.rag_conversations 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own RAG conversations" 
ON public.rag_conversations 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_content_embeddings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-updating timestamps
CREATE TRIGGER update_content_embeddings_updated_at
  BEFORE UPDATE ON public.content_embeddings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_content_embeddings_updated_at();