-- Cruising glossary pass, based on the four supplied community guides and a
-- read of the live migrated rows on 2026-09-27.
--
-- The guides agree on the cultural definition, non-verbal signalling, local
-- variation and the practical value of privacy and exit planning. They are not
-- medical authorities, so HIV/STI prevention and PEP claims are corroborated
-- with CDC material. Advice headings are not glossary concepts: this migration
-- creates only `cruising-ground`, the missing place concept, and repairs the
-- existing practice/place pages where the comparison exposed a concrete defect.
--
-- No row contains a real cruising location or directions to one. The new page
-- starts non-indexable, and all adult pages touched here remain or become
-- non-indexable.

begin;

select set_config('app.actor', 'migration:99991790501396_cruising_glossary', true);

create temporary table _cruising_new (
  slug text primary key,
  name text not null,
  category_slug text not null,
  description text not null,
  short_description text not null,
  long_description text not null,
  is_sensitive boolean not null,
  sensitive_topics text[] not null
) on commit drop;

insert into _cruising_new values (
  'cruising-ground',
  'Cruising Ground',
  'venues-nightlife',
  'A place known as somewhere people look for casual sexual partners, usually through discreet in-person signals. It may be public, semi-public or part of a venue, but the label never means that everyone present is participating.',
  'A place where people look for casual sexual partners through discreet signals.',
  'A cruising ground is a place where people look for casual sexual partners, usually through eye contact, movement and other discreet in-person signals. The term describes the social use of a place rather than a particular type of property: a cruising ground may be outdoors, semi-public or a designated part of a venue.

Knowing that a place is used for cruising does not make every person there a participant and does not turn every part of it into a sexual space. Interest still has to be mutual, a refusal or non-response ends an approach, and uninvolved people retain the ordinary use of shared surroundings. Customs and laws vary by place. Identifying individual sites can also expose the people who use them, so this glossary defines the term without publishing directions.',
  true,
  array['cruising', 'public sex', 'privacy']
);

create temporary table _cruising_aliases (
  target_slug text not null,
  alias_name text not null,
  alias_slug text not null,
  alias_type text not null
) on commit drop;

insert into _cruising_aliases values
  ('cruising-ground', 'Cruising Spot', 'cruising-spot', 'synonym');

-- Refuse to create a second concept behind an existing name, slug or alias.
insert into public.unified_tags (
  name, slug, entity_kind, description, short_description, long_description,
  category_id, category, status, seo_indexable, human_reviewed,
  verification_status, is_sensitive, sensitive_topics, usage_count,
  last_verified_at
)
select n.name, n.slug, 'concept', n.description, n.short_description,
       n.long_description, c.id, c.name, 'active', false, true, 'reviewed',
       n.is_sensitive, n.sensitive_topics, 0, now()
  from _cruising_new n
  join public.tag_categories c on c.slug = n.category_slug
 where not exists (select 1 from public.unified_tags t where t.slug = n.slug)
   and not exists (
     select 1 from public.unified_tags t
      where lower(btrim(t.name)) = lower(btrim(n.name))
   )
   and not exists (select 1 from public.tag_aliases a where a.alias_slug = n.slug)
   and not exists (
     select 1 from _cruising_aliases a
     join public.unified_tags t on t.slug = a.alias_slug
      where a.target_slug = n.slug
   )
   and not exists (
     select 1 from _cruising_aliases a
     join public.tag_aliases x on x.alias_slug = a.alias_slug
      where a.target_slug = n.slug
   );

insert into public.tag_category_assignments (tag_id, category_id, is_primary)
select t.id, c.id, true
  from _cruising_new n
  join public.unified_tags t on t.slug = n.slug
  join public.tag_categories c on c.slug = n.category_slug
 where not exists (
   select 1 from public.tag_category_assignments a
    where a.tag_id = t.id and a.category_id = c.id
 )
on conflict (tag_id, category_id) do update set is_primary = true;

-- Existing pages are updated only from the exact live state audited for this
-- pass. A later human edit therefore wins instead of being overwritten.
update public.unified_tags
   set description =
'Cruising is looking for casual sexual partners in person, often through eye contact, movement and other discreet signals in public, semi-public or designated sexual spaces.',
       short_description =
'Looking for casual sexual partners in person through discreet, mutual signals.',
       long_description =
'Cruising is looking for casual sexual partners in person, often through eye contact, movement and other discreet signals. It may happen in public or semi-public surroundings or in places intended for sexual connection, such as some bathhouses, bars and clubs. Before apps offered another route to meeting, cruising was an important way for many gay and bisexual men to find sex, companionship and community when being open was unsafe. It remains part of queer sexual culture, without belonging only to men.

A look, smile or change of position can invite further contact; it is not blanket consent. Signals vary between places and people, so interest has to remain mutual as an encounter develops. No response, moving away, freezing, a verbal refusal or changed body language means stop. A person can change their mind at any point. People who are simply using a park, toilet, gym, beach or sauna get first claim to its ordinary purpose and must not be made participants or spectators.

Context matters. House rules and local customs differ, and laws governing sexual activity, nudity and public space vary widely. Prefer a setting where sexual contact is permitted, notice signs and staff instructions, know how to leave, keep identifying information private until you choose to share it, and tell a trusted person where you plan to be if that makes you safer. Leave valuables behind or secure them, and leave immediately if a person, group or situation feels wrong. Nervous excitement is common; it is never an obligation to continue.

Choose sexual-health tools for the acts involved rather than treating cruising itself as a diagnosis or a risk category. Options include condoms or other barriers, lubricant, vaccination, HIV PrEP, testing and agreements about what people want to do. HIV PEP is time-sensitive after a possible exposure and should be sought as soon as possible, no later than 72 hours. Alcohol or other drugs can make signals and surroundings harder to read; someone who cannot make or communicate a choice cannot consent. Cruising can be anonymous, but it does not have to be unsafe, joyless or shameful.',
       updated_at = now(),
       last_verified_at = now()
 where slug = 'cruising' and status = 'active'
   and description = 'Cruising refers to the act of socializing and meeting others, often with romantic or sexual intentions, in public spaces such as parks, bars, or restrooms.'
   and short_description = 'Socializing and meeting others in public spaces'
   and long_description = 'Cruising refers to the act of socializing and meeting others, often with romantic or sexual intentions, in public spaces such as parks, bars, or restrooms. This practice has been a part of LGBTQ+ culture, particularly among gay and bisexual men, as a way to connect with others when other means of meeting people were limited or unsafe. However, it''s essential to prioritize safety and respect for others when engaging in cruising. It''s crucial to be aware of local laws and regulations regarding public gatherings and interactions.';

update public.unified_tags
   set description =
'Anonymous sex is sexual contact between people who share little or no identifying information. It may be a one-time encounter, but anonymity does not remove the need for consent, boundaries or sexual-health choices.',
       short_description =
'Sexual contact between people who share little or no identifying information.',
       long_description =
'Anonymous sex is sexual contact between people who do not exchange names or other identifying information, or who know very little about one another. It can be arranged online or happen in person through cruising, and it may involve two people or a group. “Anonymous” describes how much identity or history is shared, not the kind of sex, whether money or drugs are involved, or whether the encounter matters to the people in it.

Consent and boundaries still have to be communicated and can be withdrawn at any time. Privacy can be protected by limiting personal details and securing valuables, while sexual-health choices depend on the acts involved: condoms or other barriers, lubricant, vaccination, HIV PrEP or PEP where relevant, and testing are different tools rather than a single rule. An anonymous encounter can be pleasurable and affirming; it is not evidence of shame, recklessness or pathology.',
       updated_at = now(),
       last_verified_at = now()
 where slug = 'anonymous-sex' and status = 'active'
   and description = 'Anonymous sex refers to sexual activity that occurs between two or more people who do not know each other’s identities. Anonymous sex can take many forms, including one-night stands, casual encounters, and hookups. It can also occur in the context of group sex or orgies.'
   and short_description = 'Sex between unknown individuals'
   and long_description = 'Anonymous sex refers to a form of casual sex between people who have little or no history with each other, often meeting and engaging in sexual activity on the same day and not seeing each other again. This can involve cruising for sex, where individuals search for anonymous sexual encounters. The internet is a common means of setting up these encounters. In some cases, anonymous sex may involve an exchange of money or drugs, which can be considered a form of prostitution.';

update public.unified_tags
   set description =
'Public sex is sexual activity in a public place or somewhere visible from one. The participants’ consent does not include bystanders, and laws governing it differ between jurisdictions.',
       short_description =
'Sexual activity in a public place or somewhere visible from one.',
       long_description =
'Public sex is sexual activity in a public place or in a location that can be seen or heard from one. It is not the same thing as cruising: cruising is the search or social signalling, while public sex describes where sexual activity occurs. Some cruising encounters move to a private or designated space and never become public sex.

Consent between the people having sex does not make an uninvolved person a consenting audience. Shared parks, toilets, trails, beaches, gyms and transport facilities retain their ordinary uses, and people using them should not be made participants or spectators. A venue that permits sex may set aside particular rooms or areas; its signs, staff directions and house rules define those boundaries. Laws on nudity and sexual activity vary widely, so a glossary cannot tell a reader that an act is lawful in their location.',
       is_sensitive = true,
       sensitive_topics = array['public sex', 'consent', 'legal risk'],
       seo_indexable = false,
       human_reviewed = true,
       verification_status = 'reviewed',
       updated_at = now(),
       last_verified_at = now()
 where slug = 'public-sex' and status = 'active'
   and description = 'Public sex is the act of engaging in sexual activity in a public place, where other people may be present or able to see. Public sex can include a wide range of activities, such as kissing, touching, oral sex, and intercourse.'
   and short_description = 'Sexual activity in public or viewable spaces'
   and long_description = 'Public sex refers to sexual activity that takes place in a public context, either in a public place or in a private place that can be viewed from a public place. This can involve one or more individuals engaging in a sex act. It''s essential to note that laws and social norms regarding public sex vary widely depending on the location and culture. Engaging in public sex can pose risks, including legal consequences and personal safety concerns.';

update public.unified_tags
   set description =
'British gay slang for seeking or having sex between men in a public toilet. The word describes a specific setting and history, not cruising in general.',
       short_description =
'British gay slang for seeking or having sex between men in a public toilet.',
       long_description =
'Cottaging is British gay slang for seeking or having sex between men in a public toilet. The name is commonly linked to freestanding toilet blocks that resembled small cottages. It belongs to a history in which men used coded language and discreet public meeting places when openly seeking one another could bring arrest, violence or outing.

The term is narrower than cruising: not all cruising happens in toilets, leads to sex or involves men. A public toilet also remains an ordinary facility for people who are not participating. Mutual interest between participants does not include bystanders, and non-response or withdrawal ends an approach. Laws and enforcement differ by place, and the history of policing public sex is part of the term’s meaning rather than proof that queer sexuality itself is wrongful.',
       updated_at = now(),
       last_verified_at = now()
 where slug = 'cottaging' and status = 'active'
   and description = 'having or seeking anonymous gay sex in a public toilet'
   and short_description = 'Anonymous sex between men in public lavatories'
   and long_description = 'Cottaging is a gay slang term originating from the UK, referring to anonymous sex between men in public lavatories or cruising for partners. The term is derived from the appearance of self-contained English toilet blocks resembling small cottages. It has roots in the English cant language of Polari, used by gay men as a double entendre for sexual encounters.';

update public.unified_tags
   set description =
'A public bathing facility; in queer nightlife, “gay bathhouse” can also mean a commercial sex-on-premises venue with saunas, showers and spaces for meeting.',
       short_description =
'A public bathing facility, or a queer sex-on-premises venue built around bathing and sauna facilities.',
       long_description =
'A bathhouse is a building for communal bathing. In queer and sexual-culture contexts, a gay bathhouse or gay sauna is also a commercial venue where adults can bathe, socialise, cruise and have sex, often with lockers, showers, steam rooms, saunas, private rooms and designated play areas. The exact facilities and house rules vary, and some businesses use “sauna” rather than “bathhouse.”

The word is context-dependent: many public bathhouses and spas have no sexual purpose at all. Even inside a sex-on-premises venue, admission is not consent to contact, not every person is looking for the same thing, and different rooms may have different rules. Follow posted boundaries and staff instructions, keep valuables secured, and treat a refusal, non-response or changed signal as the end of an approach.',
       is_sensitive = true,
       sensitive_topics = array['sex-on-premises venues', 'cruising'],
       seo_indexable = false,
       updated_at = now(),
       last_verified_at = now()
 where slug = 'bathhouse' and status = 'active'
   and description is null
   and short_description = 'Buildings with pools and bathing facilities'
   and long_description = 'A bathhouse is a building equipped with swimming pools and other facilities for bathing and swimming, traditionally serving as the primary hygienic facility in a city or town. The term can also refer to public facilities for bathing or private clubs, including those catering to specific communities. Historically, bathhouses have played a significant role in urban hygiene and social interaction. The term has also been used in various cultural and artistic contexts.';

update public.unified_tags
   set description =
'An opening in a wall or partition that allows sexual contact while separating the people on either side. It is found in some adult venues and private spaces and can support anonymity.',
       short_description =
'An opening in a partition used for sexual contact between people on opposite sides.',
       long_description =
'A glory hole is an opening in a wall or partition used for sexual contact between people on opposite sides. The partition can preserve anonymity or make the separation itself part of the experience. Glory holes may be purpose-built in adult venues or private play spaces; the term describes the setup, not a guarantee about which acts will happen.

Being near or looking through one is not automatic consent. Interest and boundaries still have to be communicated, can change at any time, and may include agreement about barriers or other sexual-health choices. In a venue, house rules determine where sexual activity is allowed and who may use the space.',
       is_sensitive = true,
       sensitive_topics = array['anonymous sex', 'sexual activity'],
       seo_indexable = false,
       updated_at = now(),
       last_verified_at = now()
 where slug = 'glory-hole' and status = 'active'
   and description = 'An opening in a wall or partition through which sexual acts are performed anonymously. Found in some adult venues and private setups, emphasizing anonymity and pure physical sensation.'
   and short_description = 'Hole in a wall for sexual activity'
   and long_description = 'A glory hole is a hole in a wall or partition, often found in public toilet cubicles, public shower cubicles, or sex video arcade booths and lounges. It is used for people to engage in sexual activity or to observe the person on the opposite side. Glory holes can be found in various settings, including adult establishments and public facilities. They are often associated with anonymous sexual encounters.';

insert into public.tag_aliases (
  canonical_tag_id, alias_name, alias_slug, alias_type, review_status
)
select t.id, a.alias_name, a.alias_slug, a.alias_type, 'approved'
  from _cruising_aliases a
  join public.unified_tags t on t.slug = a.target_slug and t.status = 'active'
 where not exists (select 1 from public.tag_aliases x where x.alias_slug = a.alias_slug)
   and not exists (select 1 from public.unified_tags u where u.slug = a.alias_slug)
   and not exists (
     select 1 from public.unified_tags u
      where lower(btrim(u.name)) = lower(btrim(a.alias_name))
        and u.id <> t.id
   );

create temporary table _cruising_sources (
  tag_slug text not null,
  source_url text not null,
  claim_summary text not null
) on commit drop;

insert into _cruising_sources values
  ('cruising', 'https://www.grindr.com/blog/gay-cruising', 'Supplied community guide: queer history, privacy, exit planning, reading the setting and HIV/STI prevention options.'),
  ('cruising', 'https://www.out.com/sex/gay-cruising-tips-dos-donts', 'Supplied community account of eye contact, preparation, valuables, discretion and shame-free cruising; used critically where consent advice was incomplete.'),
  ('cruising', 'https://www.gaycities.com/articles/94498/cruising-101-what-to-know-before-heading-out-and-hooking-up/', 'Supplied guide defining cruising and stressing local law, mutual signals, non-participants and setting-specific etiquette.'),
  ('cruising', 'https://www.pride.com/answers-advice/love-and-sex/expert-gay-cruising-tips', 'Supplied expert-interview guide on nerves versus intuition, privacy, exits, consent, valuables, substances and designated settings.'),
  ('cruising', 'https://www.cdc.gov/hiv/prevention/', 'CDC corroboration for condoms, PrEP, PEP, testing and the 72-hour PEP window.'),
  ('cruising', 'https://www.cdc.gov/sti/prevention/index.html', 'CDC corroboration for route-specific STI prevention, vaccination, barriers and testing.'),
  ('cruising-ground', 'https://www.grindr.com/blog/gay-cruising', 'Supplied guide describing public, semi-public and dedicated places used for cruising without establishing any one location.'),
  ('cruising-ground', 'https://www.gaycities.com/articles/94498/cruising-101-what-to-know-before-heading-out-and-hooking-up/', 'Supplied guide distinguishing common cruising settings and the rights of people who are not participating.'),
  ('anonymous-sex', 'https://www.pride.com/answers-advice/love-and-sex/expert-gay-cruising-tips', 'Supplied expert-interview guide on identity privacy, consent, sexual-health tools and non-shaming anonymous encounters.'),
  ('anonymous-sex', 'https://www.cdc.gov/hiv/prevention/', 'CDC corroboration for the menu of HIV prevention and testing options named in the revised body.'),
  ('public-sex', 'https://www.gaycities.com/articles/94498/cruising-101-what-to-know-before-heading-out-and-hooking-up/', 'Supplied guide on local-law variability, mutual interest and the priority of non-participants in shared spaces.'),
  ('cottaging', 'https://www.grindr.com/blog/gay-cruising', 'Supplied guide using cottaging for cruising in public toilets and placing it within gay cultural history.'),
  ('bathhouse', 'https://www.pride.com/answers-advice/love-and-sex/expert-gay-cruising-tips', 'Supplied expert-interview guide identifying bathhouses as established sex-positive cruising settings with their own context and rules.'),
  ('bathhouse', 'https://www.gaycities.com/articles/94498/cruising-101-what-to-know-before-heading-out-and-hooking-up/', 'Supplied guide identifying saunas and bathhouses as possible cruising settings while warning against assuming everyone participates.'),
  ('glory-hole', 'https://www.grindr.com/blog/gay-cruising', 'Supplied queer cultural guide linking glory holes with anonymous sexual contact and cruising culture.');

insert into public.tag_sources (
  tag_id, source_type, source_url, claim_summary, fetched_at, verified_at, is_public
)
select t.id, 'editorial', s.source_url, s.claim_summary, now(), now(), false
  from _cruising_sources s
  join public.unified_tags t on t.slug = s.tag_slug
 where not exists (
   select 1 from public.tag_sources x
    where x.tag_id = t.id and x.source_url = s.source_url
 );

do $verify$
declare
  v_n int;
  v_bad int;
begin
  select count(*) into v_n
    from _cruising_new n
    join public.unified_tags t on t.slug = n.slug
    join public.tag_categories c on c.slug = n.category_slug
   where t.status = 'active'
     and not t.seo_indexable
     and t.human_reviewed
     and t.verification_status in ('reviewed', 'locked')
     and t.is_sensitive
     and t.category_id = c.id
     and t.category = c.name
     and exists (
       select 1 from public.tag_category_assignments a
        where a.tag_id = t.id and a.category_id = c.id and a.is_primary
     );
  if v_n <> 1 then
    raise exception 'cruising glossary: cruising-ground did not reach the reviewed, sensitive, non-indexable state';
  end if;

  select count(*) into v_bad from public.unified_tags
   where slug in ('cruising', 'anonymous-sex', 'public-sex', 'cottaging',
                  'bathhouse', 'glory-hole')
     and status = 'active'
     and (
       coalesce(description, '') = ''
       or coalesce(long_description, '') = ''
       or long_description !~* '(consent|mutual|non-response|refusal)'
     );
  if v_bad <> 0 then
    raise exception 'cruising glossary: % improved existing page(s) lack the audited consent or boundary language', v_bad;
  end if;

  select count(*) into v_bad from public.unified_tags
   where slug in ('cruising-ground', 'public-sex', 'bathhouse', 'glory-hole')
     and (not is_sensitive or seo_indexable);
  if v_bad <> 0 then
    raise exception 'cruising glossary: % sensitive place/page row(s) remain indexable or ungated', v_bad;
  end if;

  if not exists (
    select 1 from public.unified_tags
     where slug = 'cruising'
       and long_description ilike '%no later than 72 hours%'
       and long_description ilike '%people who are simply using%'
       and long_description ilike '%not have to be unsafe%'
  ) then
    raise exception 'cruising glossary: cruising lost health, non-participant or non-shaming content';
  end if;

  if exists (
    select 1 from public.unified_tags
     where slug = 'anonymous-sex'
       and long_description ~* '(prostitution|exchange of money or drugs)'
  ) then
    raise exception 'cruising glossary: anonymous-sex still carries the unsupported prostitution/drugs association';
  end if;

  if exists (
    select 1 from public.unified_tags
     where slug in ('cruising', 'cruising-ground')
       and coalesce(description, '') || ' ' || coalesce(long_description, '')
           ~* '(latitude|longitude|coordinates|turn left|street address|exact location)'
  ) then
    raise exception 'cruising glossary: a cruising page publishes location-finding detail';
  end if;

  select count(*) into v_n from public.tag_sources s
  join public.unified_tags t on t.id = s.tag_id
   where t.slug = 'cruising'
     and s.source_url in (
       'https://www.grindr.com/blog/gay-cruising',
       'https://www.out.com/sex/gay-cruising-tips-dos-donts',
       'https://www.gaycities.com/articles/94498/cruising-101-what-to-know-before-heading-out-and-hooking-up/',
       'https://www.pride.com/answers-advice/love-and-sex/expert-gay-cruising-tips',
       'https://www.cdc.gov/hiv/prevention/',
       'https://www.cdc.gov/sti/prevention/index.html'
     );
  if v_n <> 6 then
    raise exception 'cruising glossary: only % of 6 cruising sources landed', v_n;
  end if;

  select count(*) into v_n from public.tag_sources s
  join public.unified_tags t on t.id = s.tag_id
   where t.slug = 'cruising-ground';
  if v_n < 2 then
    raise exception 'cruising glossary: cruising-ground has fewer than two sources';
  end if;

  if not exists (
    select 1 from public.tag_aliases a
    join public.unified_tags t on t.id = a.canonical_tag_id
     where t.slug = 'cruising-ground'
       and a.alias_slug = 'cruising-spot'
       and a.review_status = 'approved'
  ) then
    raise exception 'cruising glossary: cruising-spot alias did not land';
  end if;

  select count(*) into v_bad from public.unified_tags
   where slug in ('cruising-etiquette', 'cruising-safety', 'cruising-signals');
  if v_bad <> 0 then
    raise exception 'cruising glossary: % rejected advice-shaped page(s) were created', v_bad;
  end if;
end
$verify$;

commit;
