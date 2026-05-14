-- Add review_status to content tables for city coverage tracking
-- Records without city_id are marked 'pending' for manual review

ALTER TABLE venues ADD COLUMN IF NOT EXISTS review_status text DEFAULT 'approved';
ALTER TABLE events ADD COLUMN IF NOT EXISTS review_status text DEFAULT 'approved';
ALTER TABLE personalities ADD COLUMN IF NOT EXISTS review_status text DEFAULT 'approved';

-- Mark uncovered records as pending
UPDATE venues SET review_status = 'pending' WHERE city_id IS NULL AND duplicate_of_id IS NULL;
UPDATE events SET review_status = 'pending' WHERE city_id IS NULL AND duplicate_of_id IS NULL;
UPDATE personalities SET review_status = 'pending' WHERE city_id IS NULL AND duplicate_of_id IS NULL;

-- Index for filtering
CREATE INDEX IF NOT EXISTS idx_venues_review_status ON venues (review_status) WHERE review_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_events_review_status ON events (review_status) WHERE review_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_personalities_review_status ON personalities (review_status) WHERE review_status = 'pending';
