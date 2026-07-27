-- Pilot revert — see 20260726182353. Correct sequencing: client hint-drop
-- edits deploy FIRST, then computed rels + FK flips together.
drop function if exists public.cities(public.hotels);
drop function if exists public.countries(public.hotels);
drop function if exists public.queer_villages(public.hotels);
notify pgrst, 'reload schema';
