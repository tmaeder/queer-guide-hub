-- Tag taxonomy recategorization, PR A (1/2): extend tag_entity_kind.
--
-- The 2026-08-29 corpus analysis found the glossary taxonomy polluted by a
-- KIND mismatch: `unified_tags.entity_kind` is 'concept' on 99.7% of rows
-- while the corpus mixes dictionary concepts (Drag, PrEP), content
-- descriptors (Queer-Friendly ×9,201, Bar), places (Berlin ×1,706),
-- marketplace attribute twins (Spandex ×3,044), audiences (Youth, Seniors)
-- and proper names (unknown actors filed as glossary terms). The kind axis is
-- what makes re-filing decidable, so the enum gains the missing values.
--
-- This migration contains ONLY the ALTER TYPE statements: a value added to an
-- enum cannot be USED in the same transaction that adds it (the CLI wraps
-- each migration file in one transaction), so the first writer of these
-- values must live in a later file. Precedent: 20260704160757.
--
-- The existing values stay — enum values cannot be dropped without a full
-- type swap, and 'venue_feature'/'practice'/'aesthetic' retire by data
-- update, never by type surgery. Note the type's DDL is prod-only (baseline
-- drift: 00000000000000_baseline.sql predates the column), hence IF NOT
-- EXISTS on every value.

alter type public.tag_entity_kind add value if not exists 'descriptor';
alter type public.tag_entity_kind add value if not exists 'place';
alter type public.tag_entity_kind add value if not exists 'attribute';
alter type public.tag_entity_kind add value if not exists 'audience';
alter type public.tag_entity_kind add value if not exists 'person';
