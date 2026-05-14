-- Fix invalid data in personalities table JSON/array columns
BEGIN;

-- First, let's check for and fix any NULL or empty string values
UPDATE personalities SET fields = '[]'::jsonb WHERE fields IS NULL;
UPDATE personalities SET achievements = '[]'::jsonb WHERE achievements IS NULL;
UPDATE personalities SET social_links = '{}'::jsonb WHERE social_links IS NULL;
UPDATE personalities SET tags = '{}' WHERE tags IS NULL;
UPDATE personalities SET next_concerts = '[]'::jsonb WHERE next_concerts IS NULL;

-- Handle cases where fields might have invalid JSON data
DO $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN SELECT id, fields FROM personalities WHERE fields IS NOT NULL
    LOOP
        BEGIN
            -- Try to validate the JSON
            PERFORM rec.fields::jsonb;
        EXCEPTION WHEN OTHERS THEN
            -- If invalid, set to empty array
            UPDATE personalities SET fields = '[]'::jsonb WHERE id = rec.id;
        END;
    END LOOP;
END $$;

-- Handle cases where achievements might have invalid JSON data
DO $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN SELECT id, achievements FROM personalities WHERE achievements IS NOT NULL
    LOOP
        BEGIN
            -- Try to validate the JSON
            PERFORM rec.achievements::jsonb;
        EXCEPTION WHEN OTHERS THEN
            -- If invalid, set to empty array
            UPDATE personalities SET achievements = '[]'::jsonb WHERE id = rec.id;
        END;
    END LOOP;
END $$;

-- Handle cases where social_links might have invalid JSON data
DO $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN SELECT id, social_links FROM personalities WHERE social_links IS NOT NULL
    LOOP
        BEGIN
            -- Try to validate the JSON
            PERFORM rec.social_links::jsonb;
        EXCEPTION WHEN OTHERS THEN
            -- If invalid, set to empty object
            UPDATE personalities SET social_links = '{}'::jsonb WHERE id = rec.id;
        END;
    END LOOP;
END $$;

-- Handle cases where next_concerts might have invalid JSON data
DO $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN SELECT id, next_concerts FROM personalities WHERE next_concerts IS NOT NULL
    LOOP
        BEGIN
            -- Try to validate the JSON
            PERFORM rec.next_concerts::jsonb;
        EXCEPTION WHEN OTHERS THEN
            -- If invalid, set to empty array
            UPDATE personalities SET next_concerts = '[]'::jsonb WHERE id = rec.id;
        END;
    END LOOP;
END $$;

COMMIT;