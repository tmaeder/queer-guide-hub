-- Create favorites tables for venues, events, tags, and news articles
CREATE TABLE public.venue_favorites (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  venue_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, venue_id)
);

CREATE TABLE public.event_favorites (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  event_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, event_id)
);

CREATE TABLE public.tag_favorites (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  tag_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, tag_id)
);

CREATE TABLE public.news_favorites (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  article_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, article_id)
);

-- Enable RLS for all favorites tables
ALTER TABLE public.venue_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tag_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_favorites ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for venue_favorites
CREATE POLICY "Users can manage their own venue favorites"
ON public.venue_favorites
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create RLS policies for event_favorites
CREATE POLICY "Users can manage their own event favorites"
ON public.event_favorites
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create RLS policies for tag_favorites
CREATE POLICY "Users can manage their own tag favorites"
ON public.tag_favorites
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create RLS policies for news_favorites
CREATE POLICY "Users can manage their own news favorites"
ON public.news_favorites
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);