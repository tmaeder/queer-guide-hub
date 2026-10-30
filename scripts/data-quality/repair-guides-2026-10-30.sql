BEGIN;

UPDATE public.guides SET status='review' WHERE format <> 'quest';

UPDATE public.marketplace_listings SET price=15.99,currency='GBP' WHERE id='412f09ec-8f07-4b5f-bef4-cc1e6a0775d3';

UPDATE public.marketplace_listings SET price=65.99,currency='GBP' WHERE id='4acf09f9-f777-4ae2-8a4d-37ba74c256a9';

UPDATE public.marketplace_listings SET price=36,currency='USD' WHERE id='c839f4f8-963c-402d-a97b-f592f284edd0';

UPDATE public.marketplace_listings SET price=49,currency='USD' WHERE id='29c8995f-f37e-4ca9-ad08-840918f07771';

UPDATE public.marketplace_listings SET title='Essential Chest Binder - Chai',external_url='https://tomboyx.com/products/essential-chest-binder-chai-x' WHERE id='29c8995f-f37e-4ca9-ad08-840918f07771';

DELETE FROM public.guide_picks WHERE guide_id=(SELECT id FROM public.guides WHERE slug='berlin-gay-saunas-2026');

DELETE FROM public.guide_sections WHERE guide_id=(SELECT id FROM public.guides WHERE slug='berlin-gay-saunas-2026');

INSERT INTO public.guide_picks(guide_id,entity_type,entity_id,tier,rationale_md,pros,cons,position,source_urls,verified_at) VALUES((SELECT id FROM public.guides WHERE slug='berlin-gay-saunas-2026'),'venue','804ca587-74eb-4533-9e85-4190ff4362e4','top','Choose BOILER if its published timetable fits your visit. The operator lists Monday–Thursday from noon to 06:00 the following morning, then continuous opening from Friday noon until Monday 06:00. Last admission is one hour before closing; holidays can differ.',ARRAY['Published weekday and weekend opening information','Dated activities on the operator’s calendar']::text[],ARRAY['No first-hand assessment of crowd, cleanliness or atmosphere','Admission prices and individual access needs must be confirmed with the operator']::text[],0,ARRAY['https://de.boiler-berlin.com/']::text[],now());

INSERT INTO public.guide_sections(guide_id,position,kind,body_md) VALUES((SELECT id FROM public.guides WHERE slug='berlin-gay-saunas-2026'),0,'prose','## Plan the visit

Check the calendar for your exact date and distinguish standard opening from special-event admission. If a particular facility matters to you, confirm that it is operating before you travel. A calendar listing does not establish that the whole venue is step-free.

## Questions to resolve before paying

- Ask about the current admission price, payment methods and what is included.
- Check entry policies for your age and circumstances directly with the operator.
- Ask about step-free routes, changing facilities or any other access requirement you need confirmed.

We have not verified these details and do not assume that missing information means a requirement is met.');

UPDATE public.guides SET title='Visiting BOILER Berlin: hours and what to check first',dek='A practical guide to one verified sauna, with the limits of our information made clear.',intro_md='If you are planning a sauna visit in Berlin, start with the operator’s current timetable rather than a claim about which venue has the best crowd. BOILER publishes weekday and weekend opening arrangements, last-entry rules and dated activities. These are useful planning facts; they do not predict attendance or guarantee that a particular evening will suit you.

This page covers BOILER only. It does not rank Berlin’s saunas or claim a quieter atmosphere than an unreviewed competitor. Read the operator’s latest information before travelling, especially on holidays or for a ticketed event.',format='guide',primary_entity_type='venue',selection_method='We checked the operator’s published timetable and activity calendar on 30 October 2026. This is source-based planning information for one venue, not a visit report or a comparison of every Berlin sauna.',last_verified_at=now(),reading_time_min=1,is_featured=false,meta=meta - 'generated_by' || jsonb_build_object('editorial_repair','2026-10-30','research_basis','primary_source_desk_review') || '{}'::jsonb,status='published' WHERE slug='berlin-gay-saunas-2026';

DELETE FROM public.guide_picks WHERE guide_id=(SELECT id FROM public.guides WHERE slug='berlin-queer-nightlife-starter');

DELETE FROM public.guide_sections WHERE guide_id=(SELECT id FROM public.guides WHERE slug='berlin-queer-nightlife-starter');

INSERT INTO public.guide_picks(guide_id,entity_type,entity_id,tier,rationale_md,pros,cons,position,source_urls,verified_at) VALUES((SELECT id FROM public.guides WHERE slug='berlin-queer-nightlife-starter'),'venue','1eda4bee-653b-4d0e-939d-a62fe11aff31',NULL,'Use Berghain’s official programme to identify the specific event and room. The operator distinguishes Berghain, Panorama Bar, Säule, Halle and Kantine; do not treat them as one interchangeable bar experience.',ARRAY['Room-specific programme and awareness information']::text[],ARRAY['Event availability and admission require a separate check']::text[],0,ARRAY['https://www.berghain.berlin/en/']::text[],now());

INSERT INTO public.guide_picks(guide_id,entity_type,entity_id,tier,rationale_md,pros,cons,position,source_urls,verified_at) VALUES((SELECT id FROM public.guides WHERE slug='berlin-queer-nightlife-starter'),'venue','034a16c3-5c50-4397-a25d-f36cbce8b828',NULL,'Start with ://about blank’s programme preview and FAQ. Select a particular event before making travel plans; the venue’s name alone does not tell you the music, audience or entry arrangements that night.',ARRAY['Programme preview and FAQ linked by the operator']::text[],ARRAY['No verified fixed cover charge or closing time in this guide']::text[],1,ARRAY['https://aboutblank.li/']::text[],now());

INSERT INTO public.guide_sections(guide_id,position,kind,body_md) VALUES((SELECT id FROM public.guides WHERE slug='berlin-queer-nightlife-starter'),0,'callout','## SchwuZ has changed

SchwuZ’s official site describes rebuilding and advertises events at other locations. Do not use an old Rollbergstraße listing as a current party plan. Check [SchwuZ’s own announcements](https://www.schwuz.de/) for the venue attached to a particular date.');

UPDATE public.guides SET title='Berlin club nights: choose the event before the venue',dek='Two programme-led starting points, plus an update on SchwuZ.',intro_md='A venue name is not a complete plan for a night out. Check the event, rooms, music and admission information for the date you want to go. Different nights at the same address can serve different audiences, and a queer-associated venue is not a promise that every programme will match your interests.

These are two places to begin that research. They are not ranked for friendliness or guaranteed entry. We removed unsupported claims about easier doors, fixed closing times and budget admission rather than presenting them as local knowledge.',format='list',primary_entity_type='venue',selection_method='We checked the operators’ public programme entry points and SchwuZ’s current announcement. This is a planning shortlist based on primary sources, not first-hand door or atmosphere testing.',last_verified_at=now(),reading_time_min=1,is_featured=false,meta=meta - 'generated_by' || jsonb_build_object('editorial_repair','2026-10-30','research_basis','primary_source_desk_review') || '{}'::jsonb,status='published' WHERE slug='berlin-queer-nightlife-starter';

DELETE FROM public.guide_picks WHERE guide_id=(SELECT id FROM public.guides WHERE slug='berlin-pride-circuit-2026');

DELETE FROM public.guide_sections WHERE guide_id=(SELECT id FROM public.guides WHERE slug='berlin-pride-circuit-2026');

INSERT INTO public.guide_picks(guide_id,entity_type,entity_id,tier,rationale_md,pros,cons,position,source_urls,verified_at) VALUES((SELECT id FROM public.guides WHERE slug='berlin-pride-circuit-2026'),'event','d09a7eb2-f7ec-4a96-b091-9a6e784af33e','top','The organiser’s 2026 schedule gives an opening at 11:30 and the first vehicles departing at noon. The route passed Potsdamer Platz, Nollendorfplatz and the Siegessäule, with the final rally at the Brandenburg Gate. These are historical arrangements.',ARRAY['Official route and timetable retained for reference']::text[],ARRAY['Past event; the route is not a plan for a later edition']::text[],0,ARRAY['https://csd-berlin.de/demo-route-2026/']::text[],now());

INSERT INTO public.guide_sections(guide_id,position,kind,body_md) VALUES((SELECT id FROM public.guides WHERE slug='berlin-pride-circuit-2026'),0,'callout','## Planning a future visit

Check the [official CSD Berlin website](https://csd-berlin.de/) for the next edition. Do not assume that an old party listing, route, timetable or ticket link remains valid.');

UPDATE public.guides SET title='Berlin CSD 2026: the archived parade route',dek='The corrected date and route for the 2026 demonstration. This event has ended.',intro_md='This is an archive of the 2026 Berlin CSD demonstration, not a schedule for an upcoming Pride. The organiser confirms that the parade took place on Saturday, 25 July 2026. Our earlier guide incorrectly placed it on 18 July and described Nollendorfplatz as the starting point. The corrected starting area was Leipziger Straße at Charlottenstraße.

Keep the year attached to any date you reuse from this page. Future editions can change their route, programme and arrangements. Use the organiser’s current announcement when planning a new trip.',format='guide',primary_entity_type='event',selection_method='The correction uses the organiser’s published 2026 demonstration route. We retained the verified parade record and removed unsourced party rankings. No attendance or first-hand review is implied.',last_verified_at=now(),reading_time_min=1,is_featured=false,meta=meta - 'generated_by' || jsonb_build_object('editorial_repair','2026-10-30','research_basis','primary_source_desk_review') || jsonb_build_object('historical',true),status='published' WHERE slug='berlin-pride-circuit-2026';

DELETE FROM public.guide_picks WHERE guide_id=(SELECT id FROM public.guides WHERE slug='trans-affirming-gear-2026');

DELETE FROM public.guide_sections WHERE guide_id=(SELECT id FROM public.guides WHERE slug='trans-affirming-gear-2026');

INSERT INTO public.guide_picks(guide_id,entity_type,entity_id,tier,rationale_md,pros,cons,position,source_urls,verified_at) VALUES((SELECT id FROM public.guides WHERE slug='trans-affirming-gear-2026'),'marketplace','29c8995f-f37e-4ca9-ad08-840918f07771','top','TomboyX now lists this formerly named Compression Plus Top as the Essential Chest Binder in Chai. Choose it for chest compression, rather than for holding a packer. Check the current size chart; this guide has not established individual fit or a safe wearing duration.',ARRAY['Manufacturer provides a size chart and product instructions']::text[],ARRAY['Compression and fit need individual assessment','Not presented here as swimwear']::text[],0,ARRAY['https://tomboyx.com/products/essential-chest-binder-chai-x']::text[],now());

INSERT INTO public.guide_picks(guide_id,entity_type,entity_id,tier,rationale_md,pros,cons,position,source_urls,verified_at) VALUES((SELECT id FROM public.guides WHERE slug='trans-affirming-gear-2026'),'marketplace','42a6de37-6df6-4023-9320-5ae249cd0d1c','also_great','RodeoH’s Shift Jock is an open-back underwear option with a side-loading pocket for XS–medium soft packers. It is a holder, not a packer or stand-to-pee device. The maker lists a cotton/spandex blend; confirm compatibility with the packer you already own.',ARRAY['Packing pocket with a stated compatibility range']::text[],ARRAY['Packer must be purchased separately','Open-back cut offers less coverage than boxer-style underwear']::text[],1,ARRAY['https://rodeoh.com/products/shift-jock-packer-underwear-slate-blue']::text[],now());

INSERT INTO public.guide_sections(guide_id,position,kind,body_md) VALUES((SELECT id FROM public.guides WHERE slug='trans-affirming-gear-2026'),0,'prose','## Before ordering

- Decide whether you need compression, a packing pocket or another function.
- Compare your measurements with the chart for that exact product.
- Confirm the return policy for intimate garments before opening or wearing the item.
- Check shipping to your destination and whether the selected size is available.

We have not tested these garments, established medical performance or verified that they suit swimming or post-operative use.');

UPDATE public.guides SET title='Gender-affirming clothing: a chest binder and packing underwear',dek='Two different functions, with the product and sizing limits explained.',intro_md='Choose the function you need before comparing prices: a chest binder changes the outline of the chest, while packing underwear holds a separate packer. They solve different clothing needs and should not be ranked as interchangeable upgrades. The two source-linked options below replace products whose features or availability we could not substantiate.

This is a product-information comparison, not a clinical recommendation or a claim that one size or garment is suitable for every body. Use the current manufacturer’s measurements, care information and intended-use instructions. If you need advice about a health condition or recovery, ask an appropriately qualified professional.',format='guide',primary_entity_type='marketplace',selection_method='We compared the linked product specifications for distinct uses, rather than filling a fixed number of slots. This is desk research, not a wear test. Sizes, stock and delivery depend on the selected variant and destination; confirm them with the seller. Displayed prices are recorded in the seller’s currency and exclude any additional delivery or import costs.',last_verified_at=now(),reading_time_min=1,is_featured=false,meta=meta - 'generated_by' || jsonb_build_object('editorial_repair','2026-10-30','research_basis','primary_source_desk_review') || '{}'::jsonb,status='published' WHERE slug='trans-affirming-gear-2026';

DELETE FROM public.guide_picks WHERE guide_id=(SELECT id FROM public.guides WHERE slug='lgbtq-services-that-get-it');

DELETE FROM public.guide_sections WHERE guide_id=(SELECT id FROM public.guides WHERE slug='lgbtq-services-that-get-it');

INSERT INTO public.guide_picks(guide_id,entity_type,entity_id,tier,rationale_md,pros,cons,position,source_urls,verified_at) VALUES((SELECT id FROM public.guides WHERE slug='lgbtq-services-that-get-it'),'organization','74ba9127-e021-4666-990d-ad554cd56b53','top','Schwulenberatung Berlin describes support on identity, coming out, discrimination, social-law questions, ageing and health-related concerns. Its programme includes queer-refugee support and Checkpoint BLN. Use the organisation’s service pages to find the relevant team; programmes operate at different locations.',ARRAY['Named organisation with published service information']::text[],ARRAY['Current capacity, fees and suitability need direct confirmation','A service listing is not an assessment of an individual clinician']::text[],0,ARRAY['https://schwulenberatungberlin.de/']::text[],now());

INSERT INTO public.guide_sections(guide_id,position,kind,body_md) VALUES((SELECT id FROM public.guides WHERE slug='lgbtq-services-that-get-it'),0,'prose','## Ask before booking

- Does this team handle the question you want help with?
- Is support available in your language and preferred format?
- Are there eligibility rules, fees or a waiting list?
- Which location should you attend, and can it meet your access needs?

Use [the organisation’s current service information](https://schwulenberatungberlin.de/) to choose the right contact. We have not verified current appointment capacity.');

UPDATE public.guides SET title='Finding LGBTQ+ counselling and support in Berlin',dek='Start with a named organisation and check the service that fits your question.',intro_md='If you need LGBTQ+ support in Berlin, begin with a provider that publishes its actual services and who they are for. Counselling, social support and clinical treatment are different services; a broad claim of friendliness does not establish professional qualifications, availability or the right scope for your needs.

This page now focuses on Schwulenberatung Berlin. It replaces three unsupported marketplace service examples, rather than treating an unnamed therapist, trainer and wedding planner as comparable recommendations. Read the organisation’s current programme and contact the relevant service before making arrangements.',format='guide',primary_entity_type='organization',selection_method='We checked the organisation’s own description of its remit and programme. This is a source-based starting point for Berlin support, not an endorsement of treatment outcomes or a comparison of clinical providers.',last_verified_at=now(),reading_time_min=1,is_featured=false,meta=meta - 'generated_by' || jsonb_build_object('editorial_repair','2026-10-30','research_basis','primary_source_desk_review') || '{}'::jsonb,status='published' WHERE slug='lgbtq-services-that-get-it';

DELETE FROM public.guide_picks WHERE guide_id=(SELECT id FROM public.guides WHERE slug='pride-briefs-queer-owned-underwear-2026');

DELETE FROM public.guide_sections WHERE guide_id=(SELECT id FROM public.guides WHERE slug='pride-briefs-queer-owned-underwear-2026');

INSERT INTO public.guide_picks(guide_id,entity_type,entity_id,tier,rationale_md,pros,cons,position,source_urls,verified_at) VALUES((SELECT id FROM public.guides WHERE slug='pride-briefs-queer-owned-underwear-2026'),'marketplace','c839f4f8-963c-402d-a97b-f592f284edd0',NULL,'The Void Mesh jockstrap is the fabric option: the retailer specifies a semi-transparent nylon/spandex pouch with elastic straps. Choose this construction if you want mesh rather than leather. Compare the actual waist measurements and follow the retailer’s cold-wash, hang-dry instructions.',ARRAY['Mesh construction with a published fabric breakdown']::text[],ARRAY['Open-back coverage','No hands-on durability test']::text[],0,ARRAY['https://jockstraps.com/products/cellblock-13-void-mesh-jockstrap']::text[],now());

INSERT INTO public.guide_picks(guide_id,entity_type,entity_id,tier,rationale_md,pros,cons,position,source_urls,verified_at) VALUES((SELECT id FROM public.guides WHERE slug='pride-briefs-queer-owned-underwear-2026'),'marketplace','4acf09f9-f777-4ae2-8a4d-37ba74c256a9',NULL,'The Leather Jock Strap offers an adjustable leather construction rather than a stretch-mesh garment. The maker specifies three adjustment positions and hand washing. It is the option to examine if adjustability and a leather finish matter more than conventional fabric-underwear care.',ARRAY['Adjustable construction']::text[],ARRAY['Hand-wash care','Check leather suitability and sizing before purchase']::text[],1,ARRAY['https://strappmetal.com/products/leather-jock-strap']::text[],now());

UPDATE public.guides SET title='Pride underwear: mesh or adjustable leather?',dek='Compare two constructions, without unsupported ownership or under-$40 promises.',intro_md='Decide first whether you want a lightweight mesh garment or an adjustable leather piece. These two jockstraps have different coverage, materials and care requirements, so the useful comparison is construction rather than an invented best-to-worst ranking. Prices are shown in each seller’s recorded currency; converting the number alone does not account for shipping or duties.

We replaced the earlier five-product selection after finding unavailable items and descriptions that did not match the garments. This guide does not claim a universal fit, proven wash durability or queer ownership without a separately documented source.',format='list',primary_entity_type='marketplace',selection_method='We compared the linked product specifications for distinct uses, rather than filling a fixed number of slots. This is desk research, not a wear test. Sizes, stock and delivery depend on the selected variant and destination; confirm them with the seller. Displayed prices are recorded in the seller’s currency and exclude any additional delivery or import costs.',last_verified_at=now(),reading_time_min=1,is_featured=false,meta=meta - 'generated_by' || jsonb_build_object('editorial_repair','2026-10-30','research_basis','primary_source_desk_review') || '{}'::jsonb,status='published' WHERE slug='pride-briefs-queer-owned-underwear-2026';

DELETE FROM public.guide_picks WHERE guide_id=(SELECT id FROM public.guides WHERE slug='shop-underwear-shortlist');

DELETE FROM public.guide_sections WHERE guide_id=(SELECT id FROM public.guides WHERE slug='shop-underwear-shortlist');

INSERT INTO public.guide_picks(guide_id,entity_type,entity_id,tier,rationale_md,pros,cons,position,source_urls,verified_at) VALUES((SELECT id FROM public.guides WHERE slug='shop-underwear-shortlist'),'marketplace','c839f4f8-963c-402d-a97b-f592f284edd0',NULL,'The Void Mesh jockstrap is the fabric option: the retailer specifies a semi-transparent nylon/spandex pouch with elastic straps. Choose this construction if you want mesh rather than leather. Compare the actual waist measurements and follow the retailer’s cold-wash, hang-dry instructions.',ARRAY['Mesh construction with a published fabric breakdown']::text[],ARRAY['Open-back coverage','No hands-on durability test']::text[],0,ARRAY['https://jockstraps.com/products/cellblock-13-void-mesh-jockstrap']::text[],now());

INSERT INTO public.guide_picks(guide_id,entity_type,entity_id,tier,rationale_md,pros,cons,position,source_urls,verified_at) VALUES((SELECT id FROM public.guides WHERE slug='shop-underwear-shortlist'),'marketplace','4acf09f9-f777-4ae2-8a4d-37ba74c256a9',NULL,'The Leather Jock Strap offers an adjustable leather construction rather than a stretch-mesh garment. The maker specifies three adjustment positions and hand washing. It is the option to examine if adjustability and a leather finish matter more than conventional fabric-underwear care.',ARRAY['Adjustable construction']::text[],ARRAY['Hand-wash care','Check leather suitability and sizing before purchase']::text[],1,ARRAY['https://strappmetal.com/products/leather-jock-strap']::text[],now());

UPDATE public.guides SET title='Jockstraps: compare mesh and leather construction',dek='Two source-linked options with different materials and care needs.',intro_md='This is a narrow shortlist for someone choosing between mesh and leather jockstraps. Both are open-back styles; neither replaces a full-coverage brief or a bra. If that is the coverage you need, use a different garment category rather than treating a more expensive jockstrap as an upgrade.

Check the seller’s waist measurements, adjustment range and intimate-garment return rules before ordering. We have not tested comfort over a full day or verified every size in stock. The reasons below explain why each construction is included, with care requirements that can change the buying decision.',format='list',primary_entity_type='marketplace',selection_method='We compared the linked product specifications for distinct uses, rather than filling a fixed number of slots. This is desk research, not a wear test. Sizes, stock and delivery depend on the selected variant and destination; confirm them with the seller. Displayed prices are recorded in the seller’s currency and exclude any additional delivery or import costs.',last_verified_at=now(),reading_time_min=1,is_featured=false,meta=meta - 'generated_by' || jsonb_build_object('editorial_repair','2026-10-30','research_basis','primary_source_desk_review') || '{}'::jsonb,status='published' WHERE slug='shop-underwear-shortlist';

DELETE FROM public.guide_picks WHERE guide_id=(SELECT id FROM public.guides WHERE slug='shop-apparel-shortlist');

DELETE FROM public.guide_sections WHERE guide_id=(SELECT id FROM public.guides WHERE slug='shop-apparel-shortlist');

INSERT INTO public.guide_picks(guide_id,entity_type,entity_id,tier,rationale_md,pros,cons,position,source_urls,verified_at) VALUES((SELECT id FROM public.guides WHERE slug='shop-apparel-shortlist'),'marketplace','a1a272a8-1a78-4c80-a20c-d1ae2d8cb068',NULL,'The Bruiser Flag Tee is the conventional top option. TIMOTEO lists cotton fabric, a transferred flag graphic and chest measurements. Check those measurements rather than assuming that its letter size matches another brand. Avoid ironing the transfer.',ARRAY['Published chest measurements']::text[],ARRAY['Graphic needs care when washing and ironing']::text[],0,ARRAY['https://timoteo.net/products/cb13-bruiser-flag-tee']::text[],now());

INSERT INTO public.guide_picks(guide_id,entity_type,entity_id,tier,rationale_md,pros,cons,position,source_urls,verified_at) VALUES((SELECT id FROM public.guides WHERE slug='shop-apparel-shortlist'),'marketplace','412f09ec-8f07-4b5f-bef4-cc1e6a0775d3',NULL,'Motorcross Socks add a calf-length colour detail without changing the rest of an outfit. Strapp Metal specifies a cotton/spandex blend and a ribbed top. The maker describes a single fit, so check suitability if generic sock sizing is often a problem for you.',ARRAY['Cotton/spandex construction']::text[],ARRAY['Single-fit sizing may not suit everyone']::text[],1,ARRAY['https://strappmetal.com/products/motorcross-socks']::text[],now());

UPDATE public.guides SET title='Statement clothing: a cotton tee and calf-length socks',dek='Choose a garment category first, then check measurements and care.',intro_md='These are two different ways to add a graphic or colour detail to an outfit: a cotton T-shirt and calf-length socks. They are not competing solutions to the same fit problem, and we have not ranked them as though they were. Use the shirt’s chest measurements and the sock maker’s fit description before relying on a size label.

This selection has been reduced to products with a clear source and an individual reason for inclusion. We have not wear-tested them or established a label-wide ownership claim. Delivery, available colours and return costs should be checked for your destination.',format='list',primary_entity_type='marketplace',selection_method='We compared the linked product specifications for distinct uses, rather than filling a fixed number of slots. This is desk research, not a wear test. Sizes, stock and delivery depend on the selected variant and destination; confirm them with the seller. Displayed prices are recorded in the seller’s currency and exclude any additional delivery or import costs.',last_verified_at=now(),reading_time_min=1,is_featured=false,meta=meta - 'generated_by' || jsonb_build_object('editorial_repair','2026-10-30','research_basis','primary_source_desk_review') || '{}'::jsonb,status='published' WHERE slug='shop-apparel-shortlist';

DELETE FROM public.guide_picks WHERE guide_id=(SELECT id FROM public.guides WHERE slug='shop-jewelry-shortlist');

DELETE FROM public.guide_sections WHERE guide_id=(SELECT id FROM public.guides WHERE slug='shop-jewelry-shortlist');

INSERT INTO public.guide_picks(guide_id,entity_type,entity_id,tier,rationale_md,pros,cons,position,source_urls,verified_at) VALUES((SELECT id FROM public.guides WHERE slug='shop-jewelry-shortlist'),'marketplace','eaa96c50-5eb6-4877-b1f4-9066511e8d0a',NULL,'The Infinity Ring is the standalone option. Automic Gold offers gold and platinum variants and quarter-size increments across a wide range. Choose your metal and measured ring size before comparing prices; those choices affect the order.',ARRAY['Detailed sizing and material options']::text[],ARRAY['Requires an accurate ring measurement']::text[],0,ARRAY['https://www.automicgold.com/products/infinity-ring']::text[],now());

INSERT INTO public.guide_picks(guide_id,entity_type,entity_id,tier,rationale_md,pros,cons,position,source_urls,verified_at) VALUES((SELECT id FROM public.guides WHERE slug='shop-jewelry-shortlist'),'marketplace','109caca7-6c19-4185-82f2-d51248c333d5',NULL,'The Butterfly Charm is sold individually. Select the chain or earring version to match an existing piece, and check the maker’s attachment dimensions. It is an add-on choice, not a complete necklace at the displayed charm price.',ARRAY['Separate attachment options']::text[],ARRAY['Chain or earring needed separately']::text[],1,ARRAY['https://www.automicgold.com/products/butterfly-charm']::text[],now());

UPDATE public.guides SET title='Automic Gold: choose a ring or a separate charm',dek='Two pieces with different sizing and attachment decisions.',intro_md='Choose a complete ring if you want a piece that can be worn on its own. A charm is a different purchase: it needs an appropriate chain or earring attachment, and the compatibility details matter as much as its appearance. The two Automic Gold pieces below make that distinction concrete.

This is a focused comparison within one maker’s catalogue, not a ranking of queer jewellery brands. We used the maker’s specifications and have not tested long-term wear. Check the selected metal, ring size or attachment option and final price before ordering; photographs of a styled combination do not establish what is included.',format='list',primary_entity_type='marketplace',selection_method='We compared the linked product specifications for distinct uses, rather than filling a fixed number of slots. This is desk research, not a wear test. Sizes, stock and delivery depend on the selected variant and destination; confirm them with the seller. Displayed prices are recorded in the seller’s currency and exclude any additional delivery or import costs.',last_verified_at=now(),reading_time_min=1,is_featured=false,meta=meta - 'generated_by' || jsonb_build_object('editorial_repair','2026-10-30','research_basis','primary_source_desk_review') || '{}'::jsonb,status='published' WHERE slug='shop-jewelry-shortlist';

DELETE FROM public.guide_picks WHERE guide_id=(SELECT id FROM public.guides WHERE slug='shop-books-art-shortlist');

DELETE FROM public.guide_sections WHERE guide_id=(SELECT id FROM public.guides WHERE slug='shop-books-art-shortlist');

INSERT INTO public.guide_picks(guide_id,entity_type,entity_id,tier,rationale_md,pros,cons,position,source_urls,verified_at) VALUES((SELECT id FROM public.guides WHERE slug='shop-books-art-shortlist'),'marketplace','183a6278-d55d-43f3-a1b8-a7e5f0b28dc9',NULL,'Sodomy Gods is David Lauterstein’s memoir of gay life in 1990s New York and founding Nasty Pig. The linked edition is a softcover with colour images. Choose it for a personal narrative, rather than expecting a reference history of the whole community.',ARRAY['Personal memoir with a defined setting']::text[],ARRAY['One author’s perspective']::text[],0,ARRAY['https://store.nastypig.com/products/sodomy-gods-book']::text[],now());

INSERT INTO public.guide_picks(guide_id,entity_type,entity_id,tier,rationale_md,pros,cons,position,source_urls,verified_at) VALUES((SELECT id FROM public.guides WHERE slug='shop-books-art-shortlist'),'marketplace','79c66886-2c2c-47ae-b529-5004e16e7724',NULL,'Queer Animal Oracle is an illustrated deck and guidebook by Ashley Molesso and Chess Needham of Ash + Chess. The seller specifies 60 cards and a 160-page guide. Choose it for the artwork and deck format, not as a substitute for a conventional narrative book.',ARRAY['Deck and accompanying guidebook']::text[],ARRAY['Oracle format may not suit someone expecting a reading book']::text[],1,ARRAY['https://ashandchess.com/products/queer-animal-oracle-an-inclusive-deck-guidebook']::text[],now());

UPDATE public.guides SET title='Queer reading and illustration: a memoir or an oracle deck',dek='Two different formats, with creator context and contents explained.',intro_md='Choose a memoir if you want sustained reading about one person’s life; choose an illustrated deck if you want a visual object with a different way of browsing. Combining the two under a general books-and-art label should not obscure what actually arrives in the parcel. These two entries identify the format and intended experience.

Our selection uses the creators’ and sellers’ descriptions. We have not independently reviewed either work cover to cover, and we are not claiming a definitive account of queer history. Check the edition, language, contents and delivery details before buying a gift.',format='list',primary_entity_type='marketplace',selection_method='We compared the linked product specifications for distinct uses, rather than filling a fixed number of slots. This is desk research, not a wear test. Sizes, stock and delivery depend on the selected variant and destination; confirm them with the seller. Displayed prices are recorded in the seller’s currency and exclude any additional delivery or import costs.',last_verified_at=now(),reading_time_min=1,is_featured=false,meta=meta - 'generated_by' || jsonb_build_object('editorial_repair','2026-10-30','research_basis','primary_source_desk_review') || '{}'::jsonb,status='published' WHERE slug='shop-books-art-shortlist';

DELETE FROM public.guide_picks WHERE guide_id=(SELECT id FROM public.guides WHERE slug='shop-swimwear-shortlist');

DELETE FROM public.guide_sections WHERE guide_id=(SELECT id FROM public.guides WHERE slug='shop-swimwear-shortlist');

INSERT INTO public.guide_picks(guide_id,entity_type,entity_id,tier,rationale_md,pros,cons,position,source_urls,verified_at) VALUES((SELECT id FROM public.guides WHERE slug='shop-swimwear-shortlist'),'marketplace','01f8beaf-ea6d-4849-9355-d20436734325',NULL,'The Harper and Lilo set pairs a bandana-style, wireless top with an adjustable removable strap and tie-side bottoms. D.FRANKLIN flags a larger-than-usual fit. Check both size charts, especially if your top and bottom measurements usually need different sizes.',ARRAY['Adjustable top strap and side ties']::text[],ARRAY['Limited bottom coverage','Size warning needs attention']::text[],0,ARRAY['https://www.dfranklincreation.com/products/harper-top-lilo-bottom-black-bikini']::text[],now());

INSERT INTO public.guide_picks(guide_id,entity_type,entity_id,tier,rationale_md,pros,cons,position,source_urls,verified_at) VALUES((SELECT id FROM public.guides WHERE slug='shop-swimwear-shortlist'),'marketplace','d802532c-9d42-41c7-9762-599d5ea0f7ac',NULL,'The Cherrykitten striped set is the triangle-top alternative. Compare its coverage and tie-side bottom with the bandana-style Harper top before ordering. Confirm the selected size and current delivery/return terms on the seller’s page.',ARRAY['Different top shape from the other selection']::text[],ARRAY['No verified compression or tucking function']::text[],1,ARRAY['https://www.cherrykitten.com/products/blue-and-white-stripes-y2k-print-bikini-set-cherrykitten']::text[],now());

UPDATE public.guides SET title='Two-piece swimwear: compare top shape and ties',dek='Two swim sets, with coverage and sizing checks before you order.',intro_md='For a two-piece swimsuit, compare the top’s construction and the bottom’s coverage before choosing a print. Adjustable ties change fit at particular points; they do not mean that every size fits every body. Read the size information for both pieces rather than assuming that the same letter size will suit both.

This shortlist covers two swim sets and does not promise tucking performance, compression or support that the linked product pages do not establish. We removed everyday tucking underwear from the swimming selection. The comparison is based on product information, not a chlorine-resistance or in-water wear test.',format='list',primary_entity_type='marketplace',selection_method='We compared the linked product specifications for distinct uses, rather than filling a fixed number of slots. This is desk research, not a wear test. Sizes, stock and delivery depend on the selected variant and destination; confirm them with the seller. Displayed prices are recorded in the seller’s currency and exclude any additional delivery or import costs.',last_verified_at=now(),reading_time_min=1,is_featured=false,meta=meta - 'generated_by' || jsonb_build_object('editorial_repair','2026-10-30','research_basis','primary_source_desk_review') || '{}'::jsonb,status='published' WHERE slug='shop-swimwear-shortlist';

UPDATE public.guides SET dek='A completed community archive project, with an open route for future evidence.' WHERE slug='pride-histories-may-2026';

INSERT INTO public.guide_sections(guide_id,position,kind,body_md) SELECT id,0,'callout','## Project outcome

The 14 May–13 June 2026 contribution window has ended. No contributions were recorded for this quest, so there is no completed collection to present. If you have evidence about a closed lesbian bar, use the site’s Contribute menu and include the name, city, operating years and a source or clearly attributed oral-history note. An uncertain date should be marked as uncertain.' FROM public.guides WHERE slug='pride-histories-may-2026' AND NOT EXISTS(SELECT 1 FROM public.guide_sections WHERE guide_id=guides.id);

UPDATE public.guides SET meta=meta||jsonb_build_object('quality_hold_note','Needs sourced product selections, individual rationales and an explicit editorial scope before publication. Previous quality hold retained.') WHERE slug IN ('shop-home-living-shortlist','shop-hygiene-care-shortlist');

UPDATE public.guides g SET reading_time_min=greatest(1,ceil((
 length(regexp_replace(concat_ws(' ',g.intro_md,g.selection_method,
   (SELECT string_agg(body_md,' ') FROM public.guide_sections WHERE guide_id=g.id),
   (SELECT string_agg(rationale_md||' '||array_to_string(pros,' ')||' '||array_to_string(cons,' '),' ') FROM public.guide_picks WHERE guide_id=g.id)), '\S+', 'x', 'g'))
 - length(replace(regexp_replace(concat_ws(' ',g.intro_md,g.selection_method,
   (SELECT string_agg(body_md,' ') FROM public.guide_sections WHERE guide_id=g.id),
   (SELECT string_agg(rationale_md||' '||array_to_string(pros,' ')||' '||array_to_string(cons,' '),' ') FROM public.guide_picks WHERE guide_id=g.id)), '\S+', 'x', 'g'),'x',''))
 )/200.0)::int) WHERE g.meta->>'editorial_repair'='2026-10-30';

UPDATE public.guides SET status='published' WHERE slug='pride-histories-may-2026';

COMMIT;
