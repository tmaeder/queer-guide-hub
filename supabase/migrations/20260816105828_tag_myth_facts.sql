-- Myth/fact ledger for glossary tags + the read RPC behind the "Myths & facts"
-- band on /tags/:slug.
--
-- WHAT THIS IS FOR
--
-- The "Kink Responsibly" education walls (Darklands) debunk the folk beliefs
-- that get people hurt: that orange juice treats a GHB overdose, that someone
-- passed out on G can be left to sleep, that being in a darkroom is consent.
-- Each row is one claim with its correction. The band is self-selecting like
-- the diagnostic codes: presence of rows is the signal, no "is this a myth
-- tag" flag exists anywhere.
--
-- `kind` SAYS WHAT THE CLAIM IS, NOT WHAT THE TRUTH IS
--
-- A `myth` row's `claim` is the false belief and `truth` is the correction. A
-- `fact` row's `claim` is a true statement people doubt, and `truth` explains
-- why it holds. Renderers must always show the kind label — a myth printed
-- without its ✗ reads as advice.
--
-- A GHB-specific safety row is attached to BOTH `chemsex` and `ghb`, on
-- purpose: someone on /tags/ghb about to combine something must not need to
-- know that the warning lives on a different page.
--
-- Prose is ours; factual grounding is the Kink Responsibly programme
-- (Darklands) cross-checked against standard harm-reduction guidance.

set local statement_timeout = '600s';

create table if not exists public.tag_myth_facts (
  id         uuid primary key default gen_random_uuid(),
  tag_id     uuid not null references public.unified_tags(id) on delete cascade,
  kind       text not null,
  claim      text not null,
  truth      text not null,
  sort       int  not null default 0,
  source     text not null default 'Kink Responsibly, Darklands',
  source_url text not null default 'https://www.darklands.be/',
  created_at timestamptz not null default now(),
  constraint tag_myth_facts_kind_check check (kind in ('myth', 'fact'))
);
create index if not exists tag_myth_facts_tag_idx on public.tag_myth_facts (tag_id);

alter table public.tag_myth_facts enable row level security;
drop policy if exists tag_myth_facts_public_read on public.tag_myth_facts;
create policy tag_myth_facts_public_read on public.tag_myth_facts
  for select to public using (true);
grant select on public.tag_myth_facts to anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.tag_myth_facts from anon, authenticated;

create or replace function public.get_tag_myth_facts(p_tag_id uuid)
returns table (kind text, claim text, truth text, source text, source_url text)
language sql stable security definer set search_path = public as $$
  select f.kind, f.claim, f.truth, f.source, f.source_url
    from public.tag_myth_facts f
    join public.unified_tags t on t.id = f.tag_id
   where f.tag_id = p_tag_id
     and t.status = 'active'
     and (t.is_sensitive is not true or t.verification_status in ('reviewed', 'locked'))
   order by f.sort, f.claim;
$$;

revoke all on function public.get_tag_myth_facts(uuid) from public;
grant execute on function public.get_tag_myth_facts(uuid) to anon, authenticated, service_role;

do $seed$
declare
  r record;
  v_tag uuid;
begin
  delete from public.tag_myth_facts;

  for r in select * from (values
    -- ── chemsex ─────────────────────────────────────────────────────────────
    ('chemsex', 'fact', 1,
     'Mixing speed, tina or cocaine with GHB is dangerous.',
     'Combining stimulants with GHB puts extreme strain on the heart and nervous system and can lead to serious health issues.'),
    ('chemsex', 'myth', 2,
     'If you feel sick from too many chems, orange juice or tonic will fix it.',
     'Neither prevents or treats an overdose. Seeking medical help is the safest option.'),
    ('chemsex', 'myth', 3,
     'If someone passes out from GHB, let them sleep and check on them occasionally.',
     'A GHB overdose can be life-threatening. Call emergency services immediately and place the person in the recovery position.'),
    ('chemsex', 'fact', 4,
     'Not everyone engages in chemsex.',
     'Chem use is more common in some communities, but most people do not take part. Assuming everyone does normalises pressure to join in.'),
    ('chemsex', 'myth', 5,
     'Kamagra, alcohol and poppers are not chems, so they are not dangerous.',
     'These substances have real side effects and can be dangerous, especially combined with other drugs — poppers with erection medication can crash blood pressure.'),
    ('chemsex', 'fact', 6,
     'Fisting can be done without chems.',
     'With proper preparation, relaxation and communication, fisting is entirely possible without drug use.'),
    ('chemsex', 'myth', 7,
     'If I use less than once a month, there is no problem.',
     'Frequency does not determine risk. Any use can become harmful when it starts impacting other life domains — work, social life, relationships.'),
    ('chemsex', 'myth', 8,
     'Once you engage in chemsex, you can no longer enjoy sex without chems.',
     'Body and mind may need time to adjust, but sensitivity to sober sex rebuilds. Engaging in conscious sober sex regularly is what gets you there.'),
    ('chemsex', 'myth', 9,
     'If I order online, I can be sure of the quality.',
     'Online drugs can be impure or dangerous. There is no quality control.'),
    ('chemsex', 'myth', 10,
     '3-MMC is freely available abroad, so it cannot be that dangerous.',
     'Legal or available does not mean safe. 3-MMC has been banned in many countries over heart issues, addiction potential and unpredictable effects.'),
    ('chemsex', 'myth', 11,
     'Someone overheating from ecstasy or mephedrone should drink a lot of water.',
     'Drinking too much water is itself dangerous. Small sips and cooling down are the best approach.'),
    ('chemsex', 'fact', 12,
     'Using chems without slamming can still be problematic.',
     'Problematic use is about loss of control and its impact on work, relationships and mental well-being — not the method of use.'),

    -- ── ghb (the two acute-emergency rows, duplicated on purpose) ───────────
    ('ghb', 'fact', 1,
     'Mixing speed, tina or cocaine with GHB is dangerous.',
     'Combining stimulants with GHB puts extreme strain on the heart and nervous system and can lead to serious health issues.'),
    ('ghb', 'myth', 2,
     'If someone passes out from GHB, let them sleep and check on them occasionally.',
     'A GHB overdose can be life-threatening. Call emergency services immediately and place the person in the recovery position.'),

    -- ── consent ─────────────────────────────────────────────────────────────
    ('consent', 'myth', 1,
     'If someone is in the darkroom, that means they want sex.',
     'Consent is always required, even in a darkroom. Being present is not agreement.'),
    ('consent', 'myth', 2,
     'I consented to sex, so I just have to endure it if I do not like it.',
     'You can stop at any time, even if you initially said yes. Consent can always be withdrawn.'),
    ('consent', 'fact', 3,
     'Silence is never a yes.',
     'Some people freeze or go along with a situation to keep the peace. Tensing up, looking away or a vacant stare are signals to pause immediately and check in.'),
    ('consent', 'fact', 4,
     'Someone who cannot communicate clearly cannot give consent.',
     'Under the influence of substances, boundaries and signals fade quickly. A person who is semi-conscious or unconscious cannot consent — stop the action and check in.'),

    -- ── sexual-health ───────────────────────────────────────────────────────
    ('sexual-health', 'fact', 1,
     'Not all men always want sex.',
     'Sex drive varies by individual and is influenced by stress, emotions and physical health.'),
    ('sexual-health', 'fact', 2,
     'Sex as a bottom should not be painful.',
     'Pain is a sign that something is wrong — insufficient relaxation, lack of lube, or a medical issue.'),
    ('sexual-health', 'myth', 3,
     'If my erection goes away during sex, something is wrong with me.',
     'Losing an erection can be due to stress or fatigue and is completely normal.'),
    ('sexual-health', 'fact', 4,
     'Men can be raped.',
     'Sexual violence can happen to anyone, regardless of gender identity or sexual orientation.'),
    ('sexual-health', 'myth', 5,
     'Asian men are bottoms, Black men are tops.',
     'Sexual preferences and roles have nothing to do with ethnicity.'),
    ('sexual-health', 'fact', 6,
     'Bisexuality is a legitimate sexual orientation.',
     'It is not a phase and not a denial of homosexuality.')
    ) as m(slug, kind, sort, claim, truth) loop
    select id into v_tag from public.unified_tags where slug = r.slug;
    if v_tag is null then
      raise exception 'tag_myth_facts seed: tag % missing', r.slug;
    end if;
    insert into public.tag_myth_facts (tag_id, kind, claim, truth, sort)
    values (v_tag, r.kind, r.claim, r.truth, r.sort);
  end loop;
end
$seed$;

do $verify$
declare v_n int;
begin
  select count(*) into v_n from public.get_tag_myth_facts(
    (select id from public.unified_tags where slug = 'chemsex'));
  if v_n <> 12 then
    raise exception 'tag_myth_facts verify: expected 12 chemsex rows, got %', v_n;
  end if;

  select count(*) into v_n from public.get_tag_myth_facts(
    (select id from public.unified_tags where slug = 'hiv'));
  if v_n <> 0 then
    raise exception 'tag_myth_facts verify: hiv should carry no myth/fact rows';
  end if;

  begin
    insert into public.tag_myth_facts (tag_id, kind, claim, truth)
    values ((select id from public.unified_tags where slug = 'chemsex'), 'rumor', 'x', 'y');
    raise exception 'tag_myth_facts verify: unknown kind accepted';
  exception when check_violation then null;
  end;
end
$verify$;
