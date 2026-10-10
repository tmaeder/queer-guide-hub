-- `pipeline-validate:E_JUNK_TOKEN_NAME` — the written explanation for the mint
-- gate `99991791619649` installed.
--
-- `99991791619649` deprecated twenty locale codes, filter labels and bare
-- letters from the glossary, and sealed the MINT path so the DAG cannot
-- re-create them: `unified_tags` has no validator of its own, so a glossary
-- term lands in `pipeline-validate`'s generic `else` branch where
-- `name.length >= 2` was the only rule it had to pass.
--
-- A NEW CODE WITHOUT A ROW HERE IS NOT MERELY UNDOCUMENTED. The inspector's
-- `humanize()` renders `E_JUNK_TOKEN_NAME` as "E Junk Token Name" — output that
-- READS AS CONTENT, so a code nobody has explained is indistinguishable from
-- one that has been. That is the defect `99991790358904` exists to close, which
-- is why `check-explanation-keys.mjs` fails the PR that introduces the code
-- rather than the morning after it ships. It failed on this one.
--
-- SEVERITY IS NOT A FREE CHOICE: `99991790358904`'s verify block asserts, over
-- the WHOLE `pipeline-validate` namespace, that every `E_` row is `blocking`
-- and every `W_` row is `warning` — so a mismatch here aborts `db push` for the
-- entire repo, not just this file. `E_JUNK_TOKEN_NAME` is pushed onto `errors`,
-- which is what makes the staged row rejected rather than approved, so
-- `blocking` is also what the gate actually does.
--
-- ON CONFLICT DO NOTHING, per this table's own convention: it holds
-- editor-facing copy and a re-run must never clobber a human rewrite.

insert into public.pipeline_explanations (key, title, body, what_now, severity) values
('pipeline-validate:E_JUNK_TOKEN_NAME', 'Name is a bare token, not a term',
 'The glossary term arrived with a name that is a single letter, a title-cased two-letter token such as Gb or Us, or a filter-UI label such as All, Other or None. Each is a scrape artifact rather than vocabulary: a locale code read off a venue country field or a news source locale, or a filter label minted as a concept. An all-caps two-letter name is deliberately accepted, so a real acronym such as TV or DJ is not rejected.',
 'If the term is real, give it the name a reader would look up — the all-caps form passes for a genuine acronym. If it came from a country or locale field, the extractor is reading the wrong element.',
 'blocking')
on conflict (key) do nothing;

do $verify$
declare
  v_row public.pipeline_explanations;
  v_badsev int;
begin
  -- P1. The row exists and is active, so the inspector resolves the key
  -- instead of falling back to the prettified raw code.
  select * into v_row
    from public.pipeline_explanations
   where key = 'pipeline-validate:E_JUNK_TOKEN_NAME';

  if v_row.key is null then
    raise exception 'P1: pipeline-validate:E_JUNK_TOKEN_NAME was not seeded';
  end if;
  if not v_row.active then
    raise exception 'P1: the row exists but is inactive, so the code still reads as unexplained';
  end if;

  -- P2. Severity agrees with the prefix. Asserted HERE as well as in
  -- 99991790358904, because that file's check runs only when IT applies: on a
  -- live database this seed is the one that can introduce the violation.
  if v_row.severity <> 'blocking' then
    raise exception 'P2: severity is %, but an E_ code must be blocking', v_row.severity;
  end if;

  -- P3. The same invariant corpus-wide, so a concurrent seed in the same
  -- namespace cannot slip a contradicting row past this file.
  select count(*) into v_badsev
    from public.pipeline_explanations
   where producer = 'pipeline-validate'
     and ((code like 'E\_%' and severity <> 'blocking')
       or (code like 'W\_%' and severity <> 'warning'));
  if v_badsev <> 0 then
    raise exception 'P3: % pipeline-validate rows carry a severity contradicting their code prefix', v_badsev;
  end if;

  -- P4. The copy says something. The table's CHECKs already enforce the floors
  -- (title 3-60, body >= 20); this asserts the row is not the code's own name
  -- restated, which is the shape the body floor exists to stop and which would
  -- satisfy every structural check while explaining nothing.
  if position('junk' in lower(v_row.body)) > 0 and length(btrim(v_row.body)) < 80 then
    raise exception 'P4: the body restates the code name rather than explaining it';
  end if;

  raise notice 'E_JUNK_TOKEN_NAME explained: % (%)', v_row.title, v_row.severity;
end $verify$;
