-- Add sanctions and regulatory fields to personalities table
ALTER TABLE personalities 
ADD COLUMN IF NOT EXISTS sanctions_status TEXT,
ADD COLUMN IF NOT EXISTS regulatory_notes TEXT;

-- Add comments to describe the new fields
COMMENT ON COLUMN personalities.sanctions_status IS 'Information about any sanctions, PEP status, or regulatory concerns from OpenSanctions';
COMMENT ON COLUMN personalities.regulatory_notes IS 'Any relevant regulatory or compliance information';