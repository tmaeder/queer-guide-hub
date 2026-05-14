-- Add LGBTI/queer community context fields to personalities table
ALTER TABLE personalities 
ADD COLUMN IF NOT EXISTS lgbti_connection TEXT,
ADD COLUMN IF NOT EXISTS lgbti_details TEXT;

-- Add comment to describe the new fields
COMMENT ON COLUMN personalities.lgbti_connection IS 'Indicates the person''s relationship to the LGBTI/queer community: community_member, ally, activist, representation, none_known, unclear';
COMMENT ON COLUMN personalities.lgbti_details IS 'Specific details about their LGBTI identity, activism, or contributions (if any)';