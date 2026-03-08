-- Email ingestion tracking table for the Cloudflare Email Worker.
-- Records every email processed, with extraction results and inserted IDs.

CREATE TABLE IF NOT EXISTS email_ingestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  body_text TEXT,
  body_html TEXT,

  -- Extraction results
  extracted_events INTEGER NOT NULL DEFAULT 0,
  extracted_venues INTEGER NOT NULL DEFAULT 0,
  inserted_event_ids UUID[] NOT NULL DEFAULT '{}',
  inserted_venue_ids UUID[] NOT NULL DEFAULT '{}',
  ai_extraction JSONB,

  -- Processing status
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'completed', 'failed', 'no_content')),
  error_message TEXT,
  processing_ms INTEGER,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for listing recent ingestions
CREATE INDEX idx_email_ingestions_received_at ON email_ingestions (received_at DESC);

-- Index for filtering by status
CREATE INDEX idx_email_ingestions_status ON email_ingestions (status);

-- RLS: Service role only (the CF Worker uses the service role key)
ALTER TABLE email_ingestions ENABLE ROW LEVEL SECURITY;

-- Admin read access via authenticated users with admin role
CREATE POLICY "Admins can view email ingestions"
  ON email_ingestions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Add data_source column to events if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'events' AND column_name = 'data_source'
  ) THEN
    ALTER TABLE events ADD COLUMN data_source TEXT;
  END IF;
END $$;
