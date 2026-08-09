-- Per-record opt-in for the print separation applied to an entity's hero image.
--
-- WHY THIS IS A COLUMN AND NOT A STYLE DECISION
--
-- The riso duotone (src/index.css `.duotone-riso`) renders a photograph on two
-- ink drums: shadows take the spot, highlights take the paper. On architecture
-- or interiors it reads as print. On a rainbow Pride flag it destroys the
-- subject — the flag IS its colours, and two drums cannot carry six.
--
-- Measured, not hypothesised: the first article on /news at the time of writing
-- was a Pride flag behind a chain-link fence, and the separation flattened it to
-- pink and blue. Trans and bi flags fail the same way, and all three appear
-- across news heroes, event heroes (Pride festivals) and venue heroes (a flag in
-- the window) alike. There is no signal in the data that distinguishes
-- "photograph whose colour is decorative" from "photograph whose colour is the
-- content", and no image classifier we would trust with that call on this
-- platform.
--
-- So the treatment is off unless a human says otherwise. NULL means none, which
-- is both the default and the safe answer.
--
-- Additive and nullable: the detail-page queries select '*', so no explicit
-- column list needs updating and no payload can 400 on a missing field.
--
-- 'none' is storable as well as NULL, and that is deliberate. The admin select
-- needs an option that clears the field, and Radix throws on a SelectItem whose
-- value is the empty string ("must have a value prop that is not an empty
-- string") — which is why ContentListFilters carries a SENTINEL_ALL constant.
-- Giving "off" a real name avoids inventing a second sentinel and keeps the
-- column self-describing: NULL means never set, 'none' means a human chose off.
-- Both read as no treatment.

alter table public.venues        add column if not exists image_treatment text;
alter table public.events        add column if not exists image_treatment text;
alter table public.news_articles add column if not exists image_treatment text;

-- Validated rather than NOT VALID: the column is new, so every existing row is
-- NULL and there is nothing that could fail the check.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'venues_image_treatment_known') then
    alter table public.venues add constraint venues_image_treatment_known
      check (image_treatment is null or image_treatment in ('none', 'riso', 'halftone'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'events_image_treatment_known') then
    alter table public.events add constraint events_image_treatment_known
      check (image_treatment is null or image_treatment in ('none', 'riso', 'halftone'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'news_articles_image_treatment_known') then
    alter table public.news_articles add constraint news_articles_image_treatment_known
      check (image_treatment is null or image_treatment in ('none', 'riso', 'halftone'));
  end if;
end $$;

comment on column public.venues.image_treatment is
  'Opt-in print separation for the hero image: riso | halftone | NULL (none). NULL is the default because the riso duotone flattens colour-coded identity imagery (rainbow/trans/bi flags) and nothing in the data can detect that automatically. Set only when a human has confirmed the photo''s colour is decorative.';
comment on column public.events.image_treatment is
  'Opt-in print separation for the hero image: riso | halftone | NULL (none). See venues.image_treatment — Pride event photos are the highest-risk case for the duotone.';
comment on column public.news_articles.image_treatment is
  'Opt-in print separation for the hero image: riso | halftone | NULL (none). See venues.image_treatment — news photography is documentary, so default off matters most here.';
