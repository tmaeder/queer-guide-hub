-- Create Umami analytics schema and tables for self-hosted instance
CREATE SCHEMA IF NOT EXISTS umami;

-- Websites table
CREATE TABLE IF NOT EXISTS umami.website (
  website_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_uuid UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  domain VARCHAR(500),
  share_id VARCHAR(50) UNIQUE,
  rev_id INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- Session table
CREATE TABLE IF NOT EXISTS umami.session (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_uuid UUID NOT NULL DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL REFERENCES umami.website(website_id) ON DELETE CASCADE,
  hostname VARCHAR(100),
  browser VARCHAR(20),
  os VARCHAR(20),
  device VARCHAR(20),
  screen VARCHAR(11),
  language VARCHAR(35),
  country CHAR(2),
  subdivision1 VARCHAR(20),
  subdivision2 VARCHAR(50),
  city VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Website event table
CREATE TABLE IF NOT EXISTS umami.website_event (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL REFERENCES umami.website(website_id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES umami.session(session_id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  url_path VARCHAR(500) NOT NULL,
  url_query VARCHAR(500),
  referrer_path VARCHAR(500),
  referrer_query VARCHAR(500),
  referrer_domain VARCHAR(500),
  page_title VARCHAR(500),
  event_type INTEGER DEFAULT 1,
  event_name VARCHAR(50)
);

-- Event data table for custom events
CREATE TABLE IF NOT EXISTS umami.event_data (
  event_id UUID NOT NULL REFERENCES umami.website_event(event_id) ON DELETE CASCADE,
  event_key VARCHAR(500) NOT NULL,
  event_string_value VARCHAR(500),
  event_numeric_value DECIMAL(19,4),
  event_date_value TIMESTAMP WITH TIME ZONE,
  event_data_type INTEGER NOT NULL,
  PRIMARY KEY (event_id, event_key)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_website_user_id ON umami.website(user_id);
CREATE INDEX IF NOT EXISTS idx_website_share_id ON umami.website(share_id);
CREATE INDEX IF NOT EXISTS idx_session_website_id ON umami.session(website_id);
CREATE INDEX IF NOT EXISTS idx_session_created_at ON umami.session(created_at);
CREATE INDEX IF NOT EXISTS idx_website_event_website_id ON umami.website_event(website_id);
CREATE INDEX IF NOT EXISTS idx_website_event_session_id ON umami.website_event(session_id);
CREATE INDEX IF NOT EXISTS idx_website_event_created_at ON umami.website_event(created_at);
CREATE INDEX IF NOT EXISTS idx_website_event_url_path ON umami.website_event(url_path);
CREATE INDEX IF NOT EXISTS idx_event_data_event_id ON umami.event_data(event_id);

-- Insert default website for Queer Guide
INSERT INTO umami.website (name, domain, user_id) 
VALUES (
  'Queer Guide', 
  'localhost:8080', 
  (SELECT id FROM auth.users LIMIT 1)
) ON CONFLICT DO NOTHING;

-- Enable RLS on all tables
ALTER TABLE umami.website ENABLE ROW LEVEL SECURITY;
ALTER TABLE umami.session ENABLE ROW LEVEL SECURITY;
ALTER TABLE umami.website_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE umami.event_data ENABLE ROW LEVEL SECURITY;

-- RLS Policies for website table
CREATE POLICY "Users can view their own websites" ON umami.website
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own websites" ON umami.website
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own websites" ON umami.website
  FOR UPDATE USING (auth.uid() = user_id);

-- Public read access for analytics data (anonymous tracking)
CREATE POLICY "Allow public analytics tracking" ON umami.session
  FOR ALL USING (true);

CREATE POLICY "Allow public event tracking" ON umami.website_event
  FOR ALL USING (true);

CREATE POLICY "Allow public event data tracking" ON umami.event_data
  FOR ALL USING (true);

-- Function to get or create session
CREATE OR REPLACE FUNCTION umami.get_or_create_session(
  p_website_id UUID,
  p_hostname VARCHAR(100),
  p_browser VARCHAR(20) DEFAULT NULL,
  p_os VARCHAR(20) DEFAULT NULL,
  p_device VARCHAR(20) DEFAULT NULL,
  p_screen VARCHAR(11) DEFAULT NULL,
  p_language VARCHAR(35) DEFAULT NULL,
  p_country CHAR(2) DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = umami
AS $$
DECLARE
  v_session_id UUID;
BEGIN
  -- Try to find existing session from last 30 minutes
  SELECT session_id INTO v_session_id
  FROM umami.session
  WHERE website_id = p_website_id
    AND hostname = p_hostname
    AND created_at > now() - INTERVAL '30 minutes'
  ORDER BY created_at DESC
  LIMIT 1;
  
  -- If no session found, create a new one
  IF v_session_id IS NULL THEN
    INSERT INTO umami.session (
      website_id, hostname, browser, os, device, screen, language, country
    ) VALUES (
      p_website_id, p_hostname, p_browser, p_os, p_device, p_screen, p_language, p_country
    ) RETURNING session_id INTO v_session_id;
  END IF;
  
  RETURN v_session_id;
END;
$$;