-- Check for any rows with invalid JSON in personalities table
-- First, let's try to identify problematic rows by attempting to cast fields as JSON
DO $$
DECLARE
    row_record RECORD;
    error_message TEXT;
BEGIN
    FOR row_record IN 
        SELECT id, name, fields, achievements, social_links, tags 
        FROM personalities 
        LIMIT 100
    LOOP
        BEGIN
            -- Test if fields can be parsed as valid JSON
            PERFORM row_record.fields::jsonb;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Invalid JSON in fields for personality ID %, Name: %, Fields: %', row_record.id, row_record.name, row_record.fields;
        END;

        BEGIN
            -- Test if achievements can be parsed as valid JSON
            PERFORM row_record.achievements::jsonb;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Invalid JSON in achievements for personality ID %, Name: %, Achievements: %', row_record.id, row_record.name, row_record.achievements;
        END;

        BEGIN
            -- Test if social_links can be parsed as valid JSON
            PERFORM row_record.social_links::jsonb;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Invalid JSON in social_links for personality ID %, Name: %, Social Links: %', row_record.id, row_record.name, row_record.social_links;
        END;

        BEGIN
            -- Test if tags can be parsed as valid JSON
            PERFORM row_record.tags::jsonb;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Invalid JSON in tags for personality ID %, Name: %, Tags: %', row_record.id, row_record.name, row_record.tags;
        END;
    END LOOP;
END $$;