-- Episode results recovered by reading twelve more source codes off their
-- own legends.
--
-- WHY A DELTA AND NOT A REGENERATED SEED
--
-- 20360101100200 is already applied and `db push` matches by VERSION, so
-- rewriting that file would never run. These cells were never inserted at all —
-- an unrecognised code yields NO row, by design, so that a new twist surfaces as
-- a countable gap instead of masquerading as "safe". The correction is therefore
-- a pure, idempotent INSERT of 41 cells.
--
-- WHAT THE LEGENDS ACTUALLY SAID, because three of these inverted the obvious
-- reading and one of them would have corrupted a derived statistic:
--
--   IN    -> safe.  ELEVEN season pages define it and all eleven mean "re-entered
--                   the competition", but three involve no win at all ("was
--                   chosen to re-enter"). Mapping it to `win`, which is what the
--                   token suggests in isolation, would have invented a challenge
--                   victory and inflated challenge_wins for those seasons.
--   BGT/CT/HRT/GB/SAVE/RSU -> safe. Every one is a format-specific RESCUE token
--                   ("saved from the bottom two", "saved from participating in
--                   the final lip sync"). They read like danger markers and mean
--                   the opposite — the same trap BDT set.
--   BTOP/BWIN -> win. "Blocked" costs a Legendary Legend Star, not the challenge.
--   TSW   -> high.  Won the Fame Games, which is not a maxi challenge; `win`
--                   would have counted a side game as a challenge victory.
--   WEL   -> elim.  "Won the maxi challenge, was worst on the runway and was
--                   subsequently eliminated." The terminal fact is that she left.
--
-- Distribution of the recovered cells: {"safe":34,"win":3,"high":2,"elim":2}
--
-- Unknown cells across the corpus fall 85 -> 44 (0.59%). The remainder are The
-- Switch's numeric rankings (not outcomes at all) and a dozen tokens whose pages
-- carry no legend sentence; they stay absent rather than guessed.

insert into public.competition_episode_results (entrant_id, episode_id, outcome, outcome_raw)
select ce.id, ep.id, r->>'o', r->>'raw'
  from jsonb_array_elements($DELTA$[{"e":"drag-race-brasil-season-2","name":"Bhelchi","ep":7,"o":"safe","raw":"SAVE"},{"e":"drag-race-espana-season-3","name":"Kelly Roller","ep":7,"o":"safe","raw":"IN"},{"e":"drag-race-espana-season-4","name":"La Bella Vampi","ep":7,"o":"safe","raw":"RSU"},{"e":"drag-race-espana-season-5","name":"Laca Udilla","ep":7,"o":"safe","raw":"HRT"},{"e":"drag-race-espana-season-5","name":"Nix","ep":5,"o":"safe","raw":"HRT"},{"e":"drag-race-espana-season-5","name":"Nix","ep":8,"o":"safe","raw":"HRT"},{"e":"drag-race-espana-season-5","name":"Ferrxn","ep":3,"o":"safe","raw":"HRT"},{"e":"drag-race-france-season-2","name":"Piche","ep":7,"o":"safe","raw":"IN"},{"e":"drag-race-france-season-4","name":"Lana Cotta","ep":5,"o":"safe","raw":"BGT"},{"e":"drag-race-france-season-4","name":"Lana Cotta","ep":6,"o":"safe","raw":"BGT"},{"e":"drag-race-france-season-4","name":"La Harpie","ep":2,"o":"safe","raw":"BGT"},{"e":"drag-race-france-season-4","name":"Fluffy Bidule","ep":4,"o":"safe","raw":"BGT"},{"e":"drag-race-france-season-4","name":"Holly White","ep":3,"o":"safe","raw":"BGT"},{"e":"drag-race-philippines-season-3","name":"Khianna","ep":8,"o":"safe","raw":"GB"},{"e":"rupauls-drag-race-all-stars-season-2","name":"Alyssa Edwards","ep":5,"o":"safe","raw":"IN"},{"e":"rupauls-drag-race-all-stars-season-2","name":"Tatianna","ep":5,"o":"safe","raw":"IN"},{"e":"rupauls-drag-race-all-stars-season-3","name":"Morgan McMichaels","ep":6,"o":"safe","raw":"IN"},{"e":"rupauls-drag-race-all-stars-season-4","name":"Latrice Royale","ep":6,"o":"safe","raw":"IN"},{"e":"rupauls-drag-race-all-stars-season-6","name":"Eureka!","ep":9,"o":"safe","raw":"IN"},{"e":"rupauls-drag-race-all-stars-season-7","name":"Jinkx Monsoon","ep":4,"o":"win","raw":"BTOP"},{"e":"rupauls-drag-race-all-stars-season-7","name":"Trinity the Tuck","ep":2,"o":"win","raw":"BTOP"},{"e":"rupauls-drag-race-all-stars-season-7","name":"The Vivienne","ep":6,"o":"win","raw":"BWIN"},{"e":"rupauls-drag-race-all-stars-season-8","name":"LaLa Ri","ep":11,"o":"high","raw":"TSW"},{"e":"rupauls-drag-race-all-stars-season-8","name":"Jaymes Mansfield","ep":11,"o":"high","raw":"TSW"},{"e":"rupauls-drag-race-season-7","name":"Trixie Mattel","ep":8,"o":"safe","raw":"IN"},{"e":"rupauls-drag-race-season-13","name":"LaLa Ri","ep":15,"o":"safe","raw":"GB"},{"e":"rupauls-drag-race-season-14","name":"Maddy Morphosis","ep":15,"o":"safe","raw":"GB"},{"e":"rupauls-drag-race-season-15","name":"Salina EsTitties","ep":15,"o":"safe","raw":"GB"},{"e":"rupauls-drag-race-season-15","name":"Spice","ep":8,"o":"safe","raw":"SAVE"},{"e":"rupauls-drag-race-season-16","name":"Amanda Tori Meating","ep":16,"o":"safe","raw":"GB"},{"e":"the-switch-drag-race-season-1","name":"Sofía Camará","ep":9,"o":"safe","raw":"IN"},{"e":"the-switch-drag-race-season-1","name":"Arianda Sodi","ep":17,"o":"safe","raw":"IN"},{"e":"the-switch-drag-race-season-1","name":"Laura Bell","ep":17,"o":"safe","raw":"IN"},{"e":"drag-race-thailand-season-2","name":"Kana Warrior","ep":8,"o":"safe","raw":"IN"},{"e":"drag-race-thailand-season-2","name":"Kandy Zyanide","ep":8,"o":"safe","raw":"IN"},{"e":"drag-race-thailand-season-2","name":"Tormai","ep":8,"o":"elim","raw":"WEL"},{"e":"drag-race-thailand-season-2","name":"Mocha Diva","ep":6,"o":"elim","raw":"WEL"},{"e":"rupauls-drag-race-uk-vs-the-world-series-3","name":"Mariah Balenciaga","ep":4,"o":"safe","raw":"CT"},{"e":"rupauls-drag-race-uk-vs-the-world-series-3","name":"Zahirah Zapanta","ep":5,"o":"safe","raw":"CT"},{"e":"rupauls-drag-race-uk-vs-the-world-series-3","name":"Serena Morena","ep":3,"o":"safe","raw":"CT"},{"e":"rupauls-drag-race-uk-vs-the-world-series-3","name":"Minty Fresh","ep":2,"o":"safe","raw":"CT"}]$DELTA$::jsonb) r
  join public.competition_editions ed on ed.slug = r->>'e'
  join public.competition_entrants ce
    on ce.edition_id = ed.id and lower(ce.stage_name) = lower(r->>'name')
  join public.competition_episodes ep
    on ep.edition_id = ed.id and ep.episode_number = (r->>'ep')::int
on conflict (entrant_id, episode_id) do update
  set outcome = excluded.outcome, outcome_raw = excluded.outcome_raw;

do $verify$
declare v_n int; v_bad int;
begin
  -- Every recovered code must now be present, or the join silently dropped the
  -- rows this migration exists to add.
  select count(*) into v_n from public.competition_episode_results
   where upper(regexp_replace(coalesce(outcome_raw,''), '[^A-Za-z0-9]', '', 'g'))
         = any (array['BTOP','BWIN','BGT','CT','HRT','GB','SAVE','RSU','IN','TSW','WEL']);
  if v_n < 36 then
    raise exception 'recovered cells: expected >= %, got %', 36, v_n;
  end if;

  -- The vocabulary invariant still holds.
  select count(*) into v_bad from public.competition_episode_results
   where outcome not in ('win','high','safe','low','bottom','elim','guest');
  if v_bad <> 0 then raise exception '% result(s) with an unknown outcome', v_bad; end if;

  -- And the constraint that a winner is placed first is untouched by this.
  select count(*) into v_bad from public.competition_entrants
   where is_winner and placement is not null and placement <> 1;
  if v_bad <> 0 then raise exception '% impossible winner(s)', v_bad; end if;

  raise notice 'recovered % episode result cells', v_n;
end
$verify$;
