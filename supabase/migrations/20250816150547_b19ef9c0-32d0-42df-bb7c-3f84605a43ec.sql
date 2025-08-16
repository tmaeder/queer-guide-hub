-- First migration: Add the editor role to the existing app_role enum
ALTER TYPE app_role ADD VALUE 'editor';