-- Reference vocabularies previously maintained in source are now CMS-managed.
begin;
alter table public.taxonomy_terms add column metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object');
insert into public.taxonomy_terms(id,taxonomy,value,name,metadata,parent_id,sort_order) values
('8da1b3d1-8aca-840d-a9b7-eb77a4db681e'::uuid,'pride_flag','rainbow-pride','Rainbow Pride Flag','{"id": "rainbow-pride", "nameKey": "flags.names.rainbow-pride", "nameEn": "Rainbow Pride Flag", "designer": "Gilbert Baker", "year": 1978, "stripes": [{"hex": "#E50000", "meaningKey": "flags.meanings.rainbow.red", "meaningEn": "Life"}, {"hex": "#FF8D00", "meaningKey": "flags.meanings.rainbow.orange", "meaningEn": "Healing"}, {"hex": "#FFEE00", "meaningKey": "flags.meanings.rainbow.yellow", "meaningEn": "Sunlight"}, {"hex": "#028121", "meaningKey": "flags.meanings.rainbow.green", "meaningEn": "Nature"}, {"hex": "#004CFF", "meaningKey": "flags.meanings.rainbow.blue", "meaningEn": "Serenity"}, {"hex": "#770088", "meaningKey": "flags.meanings.rainbow.violet", "meaningEn": "Spirit"}], "noteKey": "flags.notes.rainbow-pride", "noteEn": "Gilbert Baker’s original 1978 flag carried eight stripes; the six-stripe version became the standard in 1979.", "flagTagSlug": "pride-flag", "identityTagSlugs": ["queer", "gay", "lgbtq"]}'::jsonb,null,0),
('99c63fda-5dae-80b2-a1b8-518708e0c99d'::uuid,'pride_flag','progress-pride','Progress Pride Flag','{"id": "progress-pride", "nameKey": "flags.names.progress-pride", "nameEn": "Progress Pride Flag", "designer": "Daniel Quasar", "year": 2018, "stripes": [{"hex": "#E50000", "meaningKey": "flags.meanings.rainbow.red", "meaningEn": "Life"}, {"hex": "#FF8D00", "meaningKey": "flags.meanings.rainbow.orange", "meaningEn": "Healing"}, {"hex": "#FFEE00", "meaningKey": "flags.meanings.rainbow.yellow", "meaningEn": "Sunlight"}, {"hex": "#028121", "meaningKey": "flags.meanings.rainbow.green", "meaningEn": "Nature"}, {"hex": "#004CFF", "meaningKey": "flags.meanings.rainbow.blue", "meaningEn": "Serenity"}, {"hex": "#770088", "meaningKey": "flags.meanings.rainbow.violet", "meaningEn": "Spirit"}], "overlay": {"kind": "chevron", "colors": ["#FFFFFF", "#FFAFC8", "#74D7EE", "#613915", "#000000"]}, "noteKey": "flags.notes.progress-pride", "noteEn": "The chevron adds the trans flag colours, brown and black for communities of colour, and black for those living with HIV/AIDS and those lost to it — pointing right to show forward motion.", "flagTagSlug": "progress-pride-flag", "identityTagSlugs": ["queer"]}'::jsonb,null,1),
('2933ef9b-69f3-811b-ae1f-5b99430ca860'::uuid,'pride_flag','transgender-pride','Transgender Pride Flag','{"id": "transgender-pride", "nameKey": "flags.names.transgender-pride", "nameEn": "Transgender Pride Flag", "designer": "Monica Helms", "year": 1999, "stripes": [{"hex": "#5BCEFA", "meaningKey": "flags.meanings.trans.blue", "meaningEn": "Traditional colour for boys"}, {"hex": "#F5A9B8", "meaningKey": "flags.meanings.trans.pink", "meaningEn": "Traditional colour for girls"}, {"hex": "#FFFFFF", "meaningKey": "flags.meanings.trans.white", "meaningEn": "Those transitioning, intersex people, and those of neutral or undefined gender"}, {"hex": "#F5A9B8", "meaningKey": "flags.meanings.trans.pink", "meaningEn": "Traditional colour for girls"}, {"hex": "#5BCEFA", "meaningKey": "flags.meanings.trans.blue", "meaningEn": "Traditional colour for boys"}], "noteKey": "flags.notes.transgender-pride", "noteEn": "The pattern is symmetrical, so the flag is always correct however it is flown.", "flagTagSlug": "transgender-pride-flag", "identityTagSlugs": ["transgender", "trans"]}'::jsonb,null,2),
('2392f56f-b559-8f3a-adad-9f6a28942b9f'::uuid,'pride_flag','bisexual-pride','Bisexual Pride Flag','{"id": "bisexual-pride", "nameKey": "flags.names.bisexual-pride", "nameEn": "Bisexual Pride Flag", "designer": "Michael Page", "year": 1998, "stripes": [{"hex": "#D60270", "weight": 2, "meaningKey": "flags.meanings.bi.pink", "meaningEn": "Same-gender attraction"}, {"hex": "#9B4F96", "weight": 1, "meaningKey": "flags.meanings.bi.purple", "meaningEn": "Attraction across the gender spectrum"}, {"hex": "#0038A8", "weight": 2, "meaningKey": "flags.meanings.bi.blue", "meaningEn": "Different-gender attraction"}], "flagTagSlug": "bisexual-pride-flag", "identityTagSlugs": ["bisexual"]}'::jsonb,null,3),
('1af969b5-25d0-8260-ac0e-e67a1a52e7a1'::uuid,'pride_flag','pansexual-pride','Pansexual Pride Flag','{"id": "pansexual-pride", "nameKey": "flags.names.pansexual-pride", "nameEn": "Pansexual Pride Flag", "year": 2010, "stripes": [{"hex": "#FF218C", "meaningKey": "flags.meanings.pan.pink", "meaningEn": "Attraction to women"}, {"hex": "#FFD800", "meaningKey": "flags.meanings.pan.yellow", "meaningEn": "Attraction to non-binary people"}, {"hex": "#21B1FF", "meaningKey": "flags.meanings.pan.blue", "meaningEn": "Attraction to men"}], "flagTagSlug": "pansexual-pride-flag", "identityTagSlugs": ["pansexual"]}'::jsonb,null,4),
('048e58b6-398c-837c-adfd-9eaa065261a6'::uuid,'pride_flag','lesbian-pride','Lesbian Pride Flag','{"id": "lesbian-pride", "nameKey": "flags.names.lesbian-pride", "nameEn": "Lesbian Pride Flag", "designer": "Emily Gwen", "year": 2018, "stripes": [{"hex": "#D52D00", "meaningKey": "flags.meanings.lesbian.darkOrange", "meaningEn": "Gender non-conformity"}, {"hex": "#EF7627", "meaningKey": "flags.meanings.lesbian.orange", "meaningEn": "Independence"}, {"hex": "#FF9A56", "meaningKey": "flags.meanings.lesbian.lightOrange", "meaningEn": "Community"}, {"hex": "#FFFFFF", "meaningKey": "flags.meanings.lesbian.white", "meaningEn": "Unique relationships to womanhood"}, {"hex": "#D162A4", "meaningKey": "flags.meanings.lesbian.pink", "meaningEn": "Serenity and peace"}, {"hex": "#B55690", "meaningKey": "flags.meanings.lesbian.dustyPink", "meaningEn": "Love and sex"}, {"hex": "#A30262", "meaningKey": "flags.meanings.lesbian.darkRose", "meaningEn": "Femininity"}], "flagTagSlug": "lesbian-pride-flag", "identityTagSlugs": ["lesbian"]}'::jsonb,null,5),
('2ec35e46-652e-8627-ac40-99d511709eb8'::uuid,'pride_flag','gay-men-pride','Gay Men’s Pride Flag','{"id": "gay-men-pride", "nameKey": "flags.names.gay-men-pride", "nameEn": "Gay Men’s Pride Flag", "year": 2019, "stripes": [{"hex": "#078D70", "meaningKey": "flags.meanings.gaymen.green1", "meaningEn": "Community"}, {"hex": "#26CEAA", "meaningKey": "flags.meanings.gaymen.green2", "meaningEn": "Healing"}, {"hex": "#98E8C1", "meaningKey": "flags.meanings.gaymen.green3", "meaningEn": "Joy"}, {"hex": "#FFFFFF", "meaningKey": "flags.meanings.gaymen.white", "meaningEn": "Trans and gender non-conforming gay men"}, {"hex": "#7BADE2", "meaningKey": "flags.meanings.gaymen.blue1", "meaningEn": "Pure love"}, {"hex": "#5049CC", "meaningKey": "flags.meanings.gaymen.blue2", "meaningEn": "Fortitude"}, {"hex": "#3D1A78", "meaningKey": "flags.meanings.gaymen.blue3", "meaningEn": "Diversity"}], "flagTagSlug": "gay-men-pride-flag", "identityTagSlugs": ["gay"]}'::jsonb,null,6),
('36b3a4cd-180f-8ec7-a252-d11b7e398de4'::uuid,'pride_flag','nonbinary-pride','Non-Binary Pride Flag','{"id": "nonbinary-pride", "nameKey": "flags.names.nonbinary-pride", "nameEn": "Non-Binary Pride Flag", "designer": "Kye Rowan", "year": 2014, "stripes": [{"hex": "#FFF433", "meaningKey": "flags.meanings.nb.yellow", "meaningEn": "Genders outside the binary"}, {"hex": "#FFFFFF", "meaningKey": "flags.meanings.nb.white", "meaningEn": "People with many or all genders"}, {"hex": "#9B59D0", "meaningKey": "flags.meanings.nb.purple", "meaningEn": "Genders that mix male and female"}, {"hex": "#2D2D2D", "meaningKey": "flags.meanings.nb.black", "meaningEn": "People without a gender"}], "flagTagSlug": "nonbinary-pride-flag", "identityTagSlugs": ["non-binary", "nonbinary"]}'::jsonb,null,7),
('e3a7d737-ba6d-853a-a482-05ed6170d2bd'::uuid,'pride_flag','genderfluid-pride','Genderfluid Pride Flag','{"id": "genderfluid-pride", "nameKey": "flags.names.genderfluid-pride", "nameEn": "Genderfluid Pride Flag", "designer": "JJ Poole", "year": 2012, "stripes": [{"hex": "#FF75A2", "meaningKey": "flags.meanings.gf.pink", "meaningEn": "Femininity"}, {"hex": "#F5F5F5", "meaningKey": "flags.meanings.gf.white", "meaningEn": "All genders"}, {"hex": "#BE18D6", "meaningKey": "flags.meanings.gf.purple", "meaningEn": "Both masculinity and femininity"}, {"hex": "#2C2C2C", "meaningKey": "flags.meanings.gf.black", "meaningEn": "The absence of gender"}, {"hex": "#333EBD", "meaningKey": "flags.meanings.gf.blue", "meaningEn": "Masculinity"}], "flagTagSlug": "genderfluid-pride-flag", "identityTagSlugs": ["genderfluid"]}'::jsonb,null,8),
('2000270e-93d9-8c4d-a897-f10aaf552ca8'::uuid,'pride_flag','genderqueer-pride','Genderqueer Pride Flag','{"id": "genderqueer-pride", "nameKey": "flags.names.genderqueer-pride", "nameEn": "Genderqueer Pride Flag", "designer": "Marilyn Roxie", "year": 2011, "stripes": [{"hex": "#B57EDC", "meaningKey": "flags.meanings.gq.lavender", "meaningEn": "Androgyny"}, {"hex": "#FFFFFF", "meaningKey": "flags.meanings.gq.white", "meaningEn": "Agender identities"}, {"hex": "#4A8123", "meaningKey": "flags.meanings.gq.green", "meaningEn": "Non-binary identities"}], "flagTagSlug": "genderqueer-pride-flag", "identityTagSlugs": ["genderqueer"]}'::jsonb,null,9),
('cd198413-2a8c-8a0b-a66a-5dff8807476a'::uuid,'pride_flag','agender-pride','Agender Pride Flag','{"id": "agender-pride", "nameKey": "flags.names.agender-pride", "nameEn": "Agender Pride Flag", "designer": "Salem X", "year": 2014, "stripes": [{"hex": "#000000", "meaningKey": "flags.meanings.agender.black", "meaningEn": "The absence of gender"}, {"hex": "#B9B9B9", "meaningKey": "flags.meanings.agender.grey", "meaningEn": "Semi-genderlessness"}, {"hex": "#FFFFFF", "meaningKey": "flags.meanings.agender.white", "meaningEn": "The absence of gender"}, {"hex": "#B8F483", "meaningKey": "flags.meanings.agender.green", "meaningEn": "Non-binary genders"}, {"hex": "#FFFFFF", "meaningKey": "flags.meanings.agender.white", "meaningEn": "The absence of gender"}, {"hex": "#B9B9B9", "meaningKey": "flags.meanings.agender.grey", "meaningEn": "Semi-genderlessness"}, {"hex": "#000000", "meaningKey": "flags.meanings.agender.black", "meaningEn": "The absence of gender"}], "flagTagSlug": "agender-pride-flag", "identityTagSlugs": ["agender"]}'::jsonb,null,10),
('1c8e1c1b-113f-8717-afcc-4dbd8340df3a'::uuid,'pride_flag','asexual-pride','Asexual Pride Flag','{"id": "asexual-pride", "nameKey": "flags.names.asexual-pride", "nameEn": "Asexual Pride Flag", "year": 2010, "stripes": [{"hex": "#000000", "meaningKey": "flags.meanings.ace.black", "meaningEn": "Asexuality"}, {"hex": "#A3A3A3", "meaningKey": "flags.meanings.ace.grey", "meaningEn": "Grey-asexuality and demisexuality"}, {"hex": "#FFFFFF", "meaningKey": "flags.meanings.ace.white", "meaningEn": "Sexuality and allies"}, {"hex": "#800080", "meaningKey": "flags.meanings.ace.purple", "meaningEn": "Community"}], "noteKey": "flags.notes.asexual-pride", "noteEn": "Chosen by community vote on the Asexual Visibility and Education Network in 2010.", "flagTagSlug": "asexual-pride-flag", "identityTagSlugs": ["asexual"]}'::jsonb,null,11),
('7ab9a8f5-dfd9-83ca-a04d-a2edb7b53295'::uuid,'pride_flag','aromantic-pride','Aromantic Pride Flag','{"id": "aromantic-pride", "nameKey": "flags.names.aromantic-pride", "nameEn": "Aromantic Pride Flag", "designer": "Cameron Whimsy", "year": 2014, "stripes": [{"hex": "#3DA542", "meaningKey": "flags.meanings.aro.green", "meaningEn": "Aromanticism"}, {"hex": "#A7D379", "meaningKey": "flags.meanings.aro.lightGreen", "meaningEn": "The aromantic spectrum"}, {"hex": "#FFFFFF", "meaningKey": "flags.meanings.aro.white", "meaningEn": "Platonic and aesthetic attraction"}, {"hex": "#A9A9A9", "meaningKey": "flags.meanings.aro.grey", "meaningEn": "Grey-aromantic people"}, {"hex": "#000000", "meaningKey": "flags.meanings.aro.black", "meaningEn": "The sexuality spectrum"}], "flagTagSlug": "aromantic-pride-flag", "identityTagSlugs": ["aromantic"]}'::jsonb,null,12),
('750cc04e-b73a-8e33-a68c-1dfde7f580e1'::uuid,'pride_flag','demisexual-pride','Demisexual Pride Flag','{"id": "demisexual-pride", "nameKey": "flags.names.demisexual-pride", "nameEn": "Demisexual Pride Flag", "stripes": [{"hex": "#FFFFFF", "weight": 9, "meaningKey": "flags.meanings.demi.white", "meaningEn": "Sexuality"}, {"hex": "#6E0070", "weight": 2, "meaningKey": "flags.meanings.demi.purple", "meaningEn": "Community"}, {"hex": "#D2D2D2", "weight": 9, "meaningKey": "flags.meanings.demi.grey", "meaningEn": "Grey-asexuality"}], "overlay": {"kind": "triangle", "hex": "#000000"}, "noteKey": "flags.notes.demisexual-pride", "noteEn": "The black triangle at the hoist stands for asexuality.", "flagTagSlug": "demisexual-pride-flag", "identityTagSlugs": ["demisexual"]}'::jsonb,null,13),
('0a8ff4fb-cf79-8ab8-a0ce-83d6ef6fd878'::uuid,'pride_flag','intersex-pride','Intersex Pride Flag','{"id": "intersex-pride", "nameKey": "flags.names.intersex-pride", "nameEn": "Intersex Pride Flag", "designer": "Morgan Carpenter", "year": 2013, "stripes": [{"hex": "#FFD800", "meaningKey": "flags.meanings.intersex.yellow", "meaningEn": "Yellow and purple — chosen as colours free of gendered associations"}], "overlay": {"kind": "circle", "ringHex": "#7902AA"}, "noteKey": "flags.notes.intersex-pride", "noteEn": "The unbroken circle stands for wholeness and the right to bodily autonomy.", "flagTagSlug": "intersex-pride-flag", "identityTagSlugs": ["intersex"]}'::jsonb,null,14),
('ab51fc05-6ec4-8ccc-a795-a1e354c6d65f'::uuid,'pride_flag','leather-pride','Leather Pride Flag','{"id": "leather-pride", "nameKey": "flags.names.leather-pride", "nameEn": "Leather Pride Flag", "designer": "Tony DeBlase", "year": 1989, "stripes": [{"hex": "#000000"}, {"hex": "#2A2A7F"}, {"hex": "#000000"}, {"hex": "#2A2A7F"}, {"hex": "#FFFFFF"}, {"hex": "#2A2A7F"}, {"hex": "#000000"}, {"hex": "#2A2A7F"}, {"hex": "#000000"}], "overlay": {"kind": "heart", "hex": "#E70039"}, "noteKey": "flags.notes.leather-pride", "noteEn": "DeBlase deliberately assigned no meanings to the stripes or the heart, leaving interpretation to the viewer.", "flagTagSlug": "leather-pride-flag", "identityTagSlugs": ["leather"]}'::jsonb,null,15),
('77c9ea88-8d2c-8a98-a0da-fd21a86f44c9'::uuid,'pride_flag','bear-brotherhood','Bear Brotherhood Flag','{"id": "bear-brotherhood", "nameKey": "flags.names.bear-brotherhood", "nameEn": "Bear Brotherhood Flag", "designer": "Craig Byrnes", "year": 1995, "stripes": [{"hex": "#623804"}, {"hex": "#D56300"}, {"hex": "#FEDD63"}, {"hex": "#FEE6B8"}, {"hex": "#FFFFFF"}, {"hex": "#555555"}, {"hex": "#000000"}], "overlay": {"kind": "paw", "hex": "#000000"}, "noteKey": "flags.notes.bear-brotherhood", "noteEn": "The stripes represent the fur colours of bears around the world, not individual meanings.", "flagTagSlug": "bear-brotherhood-flag", "identityTagSlugs": ["bear"]}'::jsonb,null,16),
('2558fa6c-be53-8487-af35-cb75e679e318'::uuid,'hanky_code','black','Black','{"id": "black", "colorKey": "flags.hanky.colors.black", "colorEn": "Black", "hex": "#111111", "meaningKey": "flags.hanky.meanings.black", "meaningEn": "Heavy S&M", "tier": "classic"}'::jsonb,null,0),
('3a091945-4c20-8401-ae2d-6986bd470d75'::uuid,'hanky_code','grey','Grey','{"id": "grey", "colorKey": "flags.hanky.colors.grey", "colorEn": "Grey", "hex": "#808080", "meaningKey": "flags.hanky.meanings.grey", "meaningEn": "Bondage", "tier": "classic"}'::jsonb,null,1),
('c4be1475-e527-83a8-ac03-7e08e9390c9b'::uuid,'hanky_code','navy','Navy blue','{"id": "navy", "colorKey": "flags.hanky.colors.navy", "colorEn": "Navy blue", "hex": "#000080", "meaningKey": "flags.hanky.meanings.navy", "meaningEn": "Anal sex", "tier": "classic"}'::jsonb,null,2),
('ddaa3aed-c60d-8fb9-aec1-6e9e829422fa'::uuid,'hanky_code','light-blue','Light blue','{"id": "light-blue", "colorKey": "flags.hanky.colors.lightBlue", "colorEn": "Light blue", "hex": "#9BD1F5", "meaningKey": "flags.hanky.meanings.lightBlue", "meaningEn": "Oral sex", "tier": "classic"}'::jsonb,null,3),
('789e66bd-1c13-8ef6-a318-8393a0050e14'::uuid,'hanky_code','red','Red','{"id": "red", "colorKey": "flags.hanky.colors.red", "colorEn": "Red", "hex": "#C0181A", "meaningKey": "flags.hanky.meanings.red", "meaningEn": "Fisting", "tier": "classic"}'::jsonb,null,4),
('4299386f-8bd2-8e2a-ac16-e70f63bb5daf'::uuid,'hanky_code','yellow','Yellow','{"id": "yellow", "colorKey": "flags.hanky.colors.yellow", "colorEn": "Yellow", "hex": "#F5C518", "meaningKey": "flags.hanky.meanings.yellow", "meaningEn": "Watersports", "tier": "classic"}'::jsonb,null,5),
('ac370a19-57d2-861f-a984-408c16dec102'::uuid,'hanky_code','brown','Brown','{"id": "brown", "colorKey": "flags.hanky.colors.brown", "colorEn": "Brown", "hex": "#6B3F1D", "meaningKey": "flags.hanky.meanings.brown", "meaningEn": "Scat", "tier": "classic"}'::jsonb,null,6),
('bc5aad33-a4d3-81ff-aee1-d40827e68f53'::uuid,'hanky_code','green','Kelly green','{"id": "green", "colorKey": "flags.hanky.colors.green", "colorEn": "Kelly green", "hex": "#2E8B3A", "meaningKey": "flags.hanky.meanings.green", "meaningEn": "Hustling — sex for money", "tier": "classic"}'::jsonb,null,7),
('ca1af80e-4e70-8a18-a791-09c51bb37dcb'::uuid,'hanky_code','orange','Orange','{"id": "orange", "colorKey": "flags.hanky.colors.orange", "colorEn": "Orange", "hex": "#E86A17", "meaningKey": "flags.hanky.meanings.orange", "meaningEn": "Anything goes", "tier": "classic"}'::jsonb,null,8),
('f5b699df-628b-8557-a42f-bf2dfd193bc8'::uuid,'hanky_code','purple','Purple','{"id": "purple", "colorKey": "flags.hanky.colors.purple", "colorEn": "Purple", "hex": "#6A2E8F", "meaningKey": "flags.hanky.meanings.purple", "meaningEn": "Piercing", "tier": "classic"}'::jsonb,null,9),
('d221b5ca-01f5-87b3-aea8-2b20ce549a3e'::uuid,'hanky_code','white','White','{"id": "white", "colorKey": "flags.hanky.colors.white", "colorEn": "White", "hex": "#F5F5F0", "meaningKey": "flags.hanky.meanings.white", "meaningEn": "Masturbation", "tier": "extended"}'::jsonb,null,10),
('84d73aa1-5188-8d8d-a88c-f533036f8699'::uuid,'hanky_code','pink','Pink','{"id": "pink", "colorKey": "flags.hanky.colors.pink", "colorEn": "Pink", "hex": "#F2A7C3", "meaningKey": "flags.hanky.meanings.pink", "meaningEn": "Dildo play", "tier": "extended"}'::jsonb,null,11),
('d41ed2a3-e221-8ae4-a273-a00256c2bf36'::uuid,'hanky_code','fuchsia','Fuchsia','{"id": "fuchsia", "colorKey": "flags.hanky.colors.fuchsia", "colorEn": "Fuchsia", "hex": "#C4256E", "meaningKey": "flags.hanky.meanings.fuchsia", "meaningEn": "Spanking", "tier": "extended"}'::jsonb,null,12),
('0abeaa2f-edcf-8b43-a0df-fd163f296723'::uuid,'hanky_code','lavender','Lavender','{"id": "lavender", "colorKey": "flags.hanky.colors.lavender", "colorEn": "Lavender", "hex": "#B57EDC", "meaningKey": "flags.hanky.meanings.lavender", "meaningEn": "Drag", "tier": "extended"}'::jsonb,null,13),
('087fff4c-c6bb-8fdb-ae33-3cd2464f1c9c'::uuid,'hanky_code','charcoal','Charcoal','{"id": "charcoal", "colorKey": "flags.hanky.colors.charcoal", "colorEn": "Charcoal", "hex": "#3A3A3A", "meaningKey": "flags.hanky.meanings.charcoal", "meaningEn": "Rubber and latex", "tier": "extended"}'::jsonb,null,14),
('e86da5bb-6ccb-8a86-aee0-0888dc32b881'::uuid,'hanky_code','hunter-green','Hunter green','{"id": "hunter-green", "colorKey": "flags.hanky.colors.hunterGreen", "colorEn": "Hunter green", "hex": "#1E4D2B", "meaningKey": "flags.hanky.meanings.hunterGreen", "meaningEn": "Daddy / boy dynamics", "tier": "extended"}'::jsonb,null,15),
('7fd0c80f-9a5f-88f7-a5f3-f60858469140'::uuid,'competition_category','drag_series','Drag competition series','{"id": "drag_series", "slug": "drag-series", "labelKey": "competitions.category.dragSeries", "label": "Drag competition series", "blurbKey": "competitions.category.dragSeriesBlurb", "blurb": "Episodic television: the Drag Race franchises alongside independent shows like Dragula, La Más Draga and Drag Den. Each season carries an episode-by-episode placement grid.", "metaTitle": "Drag Competition Series: Every Season | Queer Guide", "metaDescription": "Every season of the Drag Race franchises and the independent drag competition series, with winners, runners-up and an episode-by-episode placement grid.", "hasGrid": true, "bullet": {"letter": "S", "track": "pink"}, "icon": "theater"}'::jsonb,null,0),
('baf0713f-bd31-805e-a853-d1ff58c88bea'::uuid,'competition_category','drag_king','Drag king competitions','{"id": "drag_king", "slug": "drag-kings", "labelKey": "competitions.category.dragKing", "label": "Drag king competitions", "blurbKey": "competitions.category.dragKingBlurb", "blurb": "Competitions for drag kings. King of Drag is a television series and sits here rather than with the other series, because filed among the queen franchises it would be one row in thirty-three.", "metaTitle": "Drag King Competitions | Queer Guide", "metaDescription": "Drag king competitions: King of Drag and the San Francisco Drag King Contest, which has run since 1994.", "hasGrid": true, "bullet": {"letter": "K", "track": "blue"}, "icon": "nightlife"}'::jsonb,null,1),
('c736549b-c9a2-88b7-afaa-72f57abfdc61'::uuid,'competition_category','drag_pageant','Drag pageantry','{"id": "drag_pageant", "slug": "drag-pageants", "labelKey": "competitions.category.dragPageant", "label": "Drag pageantry", "blurbKey": "competitions.category.dragPageantBlurb", "blurb": "Drag pageantry systems, decided at a single event rather than across a season. Miss Gay America has run since 1973 and Miss Continental since 1980, both older than the television.", "metaTitle": "Drag Pageantry: Miss Gay America and Miss Continental | Queer Guide", "metaDescription": "Drag pageantry systems: Miss Gay America since 1973 and Miss Continental since 1980, with every titleholder by year.", "hasGrid": false, "bullet": {"letter": "P", "track": "green"}, "icon": "disco"}'::jsonb,null,2),
('7bf15cf4-69e4-8c9b-aef4-6bfa88576fc0'::uuid,'competition_category','trans_pageant','Transgender pageants','{"id": "trans_pageant", "slug": "trans-pageants", "labelKey": "competitions.category.transPageant", "label": "Transgender pageants", "blurbKey": "competitions.category.transPageantBlurb", "blurb": "Beauty pageants for transgender women, including Miss International Queen, which describes itself as the world’s largest, and Miss T World.", "metaTitle": "Transgender Beauty Pageants | Queer Guide", "metaDescription": "Transgender beauty pageants: Miss International Queen, Miss T World, Miss Star International and Miss Fabulous Thailand, with every titleholder by year.", "hasGrid": false, "bullet": {"letter": "T", "track": "yellow"}, "icon": "trans-pride"}'::jsonb,null,3),
('0545bc56-c410-83e1-aba9-d6fdb1292c16'::uuid,'competition_category','gay_title','Gay titleholder contests','{"id": "gay_title", "slug": "gay-titles", "labelKey": "competitions.category.gayTitle", "label": "Gay titleholder contests", "blurbKey": "competitions.category.gayTitleBlurb", "blurb": "Titleholder contests for gay men. Mr Gay World is an international final; Mr Gay Europe describes itself as a competition about LGBTQIA+ themes rather than a pageant.", "metaTitle": "Gay Titleholder Contests: Mr Gay World and Mr Gay Europe | Queer Guide", "metaDescription": "Gay titleholder contests: Mr Gay World, Mr Gay Europe and Mr. Gay India, with every titleholder by year.", "hasGrid": false, "bullet": {"letter": "G", "track": "pink"}, "icon": "achillean"}'::jsonb,null,4),
('aadfcae5-a5e1-88b8-a366-086d006a7c83'::uuid,'competition_category','leather_title','Leather & fetish titles','{"id": "leather_title", "slug": "leather-titles", "labelKey": "competitions.category.leatherTitle", "label": "Leather & fetish titles", "blurbKey": "competitions.category.leatherTitleBlurb", "blurb": "Leather and fetish title contests, both run as multi-day conventions. International Mr. Leather has been held since 1979 and calls itself a convention and competition, not a pageant.", "metaTitle": "Leather and Fetish Titles: IML and MIR | Queer Guide", "metaDescription": "Leather and fetish title contests: International Mr. Leather since 1979 and Mister International Rubber, with every titleholder by year.", "hasGrid": false, "bullet": {"letter": "L", "track": "blue"}, "icon": "collar"}'::jsonb,null,5),
('5e012458-9ad0-8f9d-a3c4-16e433bdbc42'::uuid,'marketplace_browse','department:apparel','Apparel','{}'::jsonb,null,0),
('15a8e022-15e3-8e5d-a609-1ae9ca078162'::uuid,'marketplace_browse','group:tops','Tops','{}'::jsonb,'5e012458-9ad0-8f9d-a3c4-16e433bdbc42'::uuid,0),
('6166e785-b4e4-8a55-a8af-ed5f8a3e1ad3'::uuid,'marketplace_browse','fine:t_shirts','T-shirts','{}'::jsonb,'15a8e022-15e3-8e5d-a609-1ae9ca078162'::uuid,0),
('c09eb056-4d57-8d31-aaa9-a622b0f75b86'::uuid,'marketplace_browse','fine:tanks','Tanks & camis','{}'::jsonb,'15a8e022-15e3-8e5d-a609-1ae9ca078162'::uuid,1),
('dc734219-4321-821c-a12b-32817f795a77'::uuid,'marketplace_browse','fine:crop_tops','Crop tops','{}'::jsonb,'15a8e022-15e3-8e5d-a609-1ae9ca078162'::uuid,2),
('4b6e1c70-4e59-865d-abac-fbe732b711c9'::uuid,'marketplace_browse','fine:jerseys_polos','Jerseys & polos','{}'::jsonb,'15a8e022-15e3-8e5d-a609-1ae9ca078162'::uuid,3),
('90ac426c-8e6c-8a86-a30d-10abece52859'::uuid,'marketplace_browse','fine:shirts_blouses','Shirts & blouses','{}'::jsonb,'15a8e022-15e3-8e5d-a609-1ae9ca078162'::uuid,4),
('cbd9cc65-54b3-8cd6-ab0f-6cda56164d4d'::uuid,'marketplace_browse','group:bottoms','Bottoms','{}'::jsonb,'5e012458-9ad0-8f9d-a3c4-16e433bdbc42'::uuid,1),
('a479aa44-cc90-8d18-ae8b-5083468300b6'::uuid,'marketplace_browse','fine:jeans','Jeans','{}'::jsonb,'cbd9cc65-54b3-8cd6-ab0f-6cda56164d4d'::uuid,0),
('4fccd7f7-ea2b-8040-a543-2d31f68523a0'::uuid,'marketplace_browse','fine:shorts','Shorts','{}'::jsonb,'cbd9cc65-54b3-8cd6-ab0f-6cda56164d4d'::uuid,1),
('250502d5-5f15-88d5-a8b0-1dfe2834957e'::uuid,'marketplace_browse','fine:leggings_joggers','Leggings & joggers','{}'::jsonb,'cbd9cc65-54b3-8cd6-ab0f-6cda56164d4d'::uuid,2),
('0fd080c8-610b-8b0a-aece-9999517d266f'::uuid,'marketplace_browse','fine:skirts','Skirts','{}'::jsonb,'cbd9cc65-54b3-8cd6-ab0f-6cda56164d4d'::uuid,3),
('6f5ea0ab-3a41-8561-a284-993b83a3f8ce'::uuid,'marketplace_browse','group:outerwear','Outerwear','{}'::jsonb,'5e012458-9ad0-8f9d-a3c4-16e433bdbc42'::uuid,2),
('a9e1fb52-082a-8a58-a110-971760d0d9d9'::uuid,'marketplace_browse','fine:hoodies','Hoodies & sweatshirts','{}'::jsonb,'6f5ea0ab-3a41-8561-a284-993b83a3f8ce'::uuid,0),
('67121333-560f-8510-ab43-a1837aceffc3'::uuid,'marketplace_browse','fine:sweaters','Sweaters & knits','{}'::jsonb,'6f5ea0ab-3a41-8561-a284-993b83a3f8ce'::uuid,1),
('ddcbce31-9f50-891e-a164-7d2cd9a15f20'::uuid,'marketplace_browse','fine:jackets','Jackets & coats','{}'::jsonb,'6f5ea0ab-3a41-8561-a284-993b83a3f8ce'::uuid,2),
('9bff47bb-5e76-8345-ad1f-14a86a6da96c'::uuid,'marketplace_browse','group:bodywear','Bodywear','{}'::jsonb,'5e012458-9ad0-8f9d-a3c4-16e433bdbc42'::uuid,3),
('9c27dc60-4d43-8903-a5ab-5da916fd0ba4'::uuid,'marketplace_browse','group:footwear','Footwear','{}'::jsonb,'5e012458-9ad0-8f9d-a3c4-16e433bdbc42'::uuid,4),
('deafe28f-e7c8-850c-a679-6147da39e1e9'::uuid,'marketplace_browse','group:headwear','Headwear','{}'::jsonb,'5e012458-9ad0-8f9d-a3c4-16e433bdbc42'::uuid,5),
('71afbf67-a48f-87f5-a3a6-1915d00e96bf'::uuid,'marketplace_browse','group:socks','Socks','{}'::jsonb,'5e012458-9ad0-8f9d-a3c4-16e433bdbc42'::uuid,6),
('3fb9230c-77c0-88ce-aece-404008a6f3b9'::uuid,'marketplace_browse','group:accessories','Accessories','{}'::jsonb,'5e012458-9ad0-8f9d-a3c4-16e433bdbc42'::uuid,7),
('14d514c0-73be-8565-a729-166433f62966'::uuid,'marketplace_browse','fine:bags','Bags','{}'::jsonb,'3fb9230c-77c0-88ce-aece-404008a6f3b9'::uuid,0),
('d3401b77-ce13-86f1-aaff-d43588c7b3c4'::uuid,'marketplace_browse','fine:pins_badges','Pins & badges','{}'::jsonb,'3fb9230c-77c0-88ce-aece-404008a6f3b9'::uuid,1),
('b979cf11-a42b-8765-ac48-3b43077ecfd0'::uuid,'marketplace_browse','fine:patches_stickers','Patches & stickers','{}'::jsonb,'3fb9230c-77c0-88ce-aece-404008a6f3b9'::uuid,2),
('45292008-ee7c-8c6b-a6d1-ca24aa1b7725'::uuid,'marketplace_browse','fine:flags','Flags','{}'::jsonb,'3fb9230c-77c0-88ce-aece-404008a6f3b9'::uuid,3),
('4c0b6246-e9f0-8fef-aaa4-5ba37c3893e9'::uuid,'marketplace_browse','fine:belts','Belts','{}'::jsonb,'3fb9230c-77c0-88ce-aece-404008a6f3b9'::uuid,4),
('0f17b3c2-4350-880b-a29e-fa63d8ce6b48'::uuid,'marketplace_browse','fine:hats','Hats & caps','{}'::jsonb,'3fb9230c-77c0-88ce-aece-404008a6f3b9'::uuid,5),
('c4e465cc-6025-8215-a52a-7705116fdfa4'::uuid,'marketplace_browse','fine:scarves_gloves','Scarves & gloves','{}'::jsonb,'3fb9230c-77c0-88ce-aece-404008a6f3b9'::uuid,6),
('93d38c70-9709-81c4-a99f-e92df98cd789'::uuid,'marketplace_browse','fine:keychains','Keychains','{}'::jsonb,'3fb9230c-77c0-88ce-aece-404008a6f3b9'::uuid,7),
('99f70b75-4c6b-8baa-a9f9-eef889519162'::uuid,'marketplace_browse','fine:sunglasses','Sunglasses','{}'::jsonb,'3fb9230c-77c0-88ce-aece-404008a6f3b9'::uuid,8),
('07fb8c32-e217-8123-a573-ec1aa455d62f'::uuid,'marketplace_browse','fine:wigs','Wigs','{}'::jsonb,'3fb9230c-77c0-88ce-aece-404008a6f3b9'::uuid,9),
('5adfe5fa-8011-8b5c-a783-0676e849e57a'::uuid,'marketplace_browse','group:apparel','Clothing','{}'::jsonb,'5e012458-9ad0-8f9d-a3c4-16e433bdbc42'::uuid,8),
('76b895db-5cb4-8ba4-a891-4316fd721b90'::uuid,'marketplace_browse','department:underwear','Underwear','{}'::jsonb,null,1),
('b93d9804-c13a-8621-a02d-a9eee0485754'::uuid,'marketplace_browse','group:underwear','Underwear','{}'::jsonb,'76b895db-5cb4-8ba4-a891-4316fd721b90'::uuid,0),
('57ff5442-d08a-8f64-a0df-fdcd121393ca'::uuid,'marketplace_browse','fine:briefs','Briefs','{}'::jsonb,'b93d9804-c13a-8621-a02d-a9eee0485754'::uuid,0),
('76459c53-f481-846c-a058-ea1f0000f8ac'::uuid,'marketplace_browse','fine:boxers_trunks','Boxers & trunks','{}'::jsonb,'b93d9804-c13a-8621-a02d-a9eee0485754'::uuid,1),
('41accacb-1510-800e-aeee-d7a480c12d9d'::uuid,'marketplace_browse','fine:binders','Binders','{}'::jsonb,'b93d9804-c13a-8621-a02d-a9eee0485754'::uuid,2),
('8bdefab7-7223-8fb8-ada6-faa2036abff7'::uuid,'marketplace_browse','fine:packing_underwear','Packing underwear','{}'::jsonb,'b93d9804-c13a-8621-a02d-a9eee0485754'::uuid,3),
('649bdd90-9355-8b14-a1aa-270caf3ca4ed'::uuid,'marketplace_browse','fine:bras','Bras & bralettes','{}'::jsonb,'b93d9804-c13a-8621-a02d-a9eee0485754'::uuid,4),
('a70c5c8b-3c22-87d3-a9df-4dffb44963ce'::uuid,'marketplace_browse','group:jockstraps','Jockstraps','{}'::jsonb,'76b895db-5cb4-8ba4-a891-4316fd721b90'::uuid,1),
('899073e3-2a3f-894b-ae57-91d30882b7b5'::uuid,'marketplace_browse','group:thongs','Thongs','{}'::jsonb,'76b895db-5cb4-8ba4-a891-4316fd721b90'::uuid,2),
('eec166cf-7e04-84e2-ab61-901b414e1c41'::uuid,'marketplace_browse','group:lingerie','Lingerie','{}'::jsonb,'76b895db-5cb4-8ba4-a891-4316fd721b90'::uuid,3),
('92d4dff3-3e96-8331-aa81-243f78b5b387'::uuid,'marketplace_browse','department:swimwear','Swimwear','{}'::jsonb,null,2),
('0a978a2c-dad0-894f-ae56-12333f57325a'::uuid,'marketplace_browse','group:swimwear','Swimwear','{}'::jsonb,'92d4dff3-3e96-8331-aa81-243f78b5b387'::uuid,0),
('74c952da-a4f8-8c57-a20d-c7724f4e55a4'::uuid,'marketplace_browse','fine:swim_briefs','Swim briefs','{}'::jsonb,'0a978a2c-dad0-894f-ae56-12333f57325a'::uuid,0),
('102ea1fc-4e46-85a6-a3e5-12e839590b3a'::uuid,'marketplace_browse','fine:swim_trunks','Trunks & shorts','{}'::jsonb,'0a978a2c-dad0-894f-ae56-12333f57325a'::uuid,1),
('2daea39f-409f-8a10-adb7-a9cd2557f215'::uuid,'marketplace_browse','fine:bikinis','Bikinis','{}'::jsonb,'0a978a2c-dad0-894f-ae56-12333f57325a'::uuid,2),
('4eafe09d-5160-8adb-ac0a-ab2bfa637fc2'::uuid,'marketplace_browse','fine:one_piece','One-pieces','{}'::jsonb,'0a978a2c-dad0-894f-ae56-12333f57325a'::uuid,3),
('adbd45fa-2bf2-850c-a264-17bcc346739d'::uuid,'marketplace_browse','department:jewelry','Jewelry','{}'::jsonb,null,3),
('9d21180c-d691-8463-a75f-eb612863b7a1'::uuid,'marketplace_browse','group:jewelry','Jewelry','{}'::jsonb,'adbd45fa-2bf2-850c-a264-17bcc346739d'::uuid,0),
('40391bc1-c2a6-8d14-af32-7e5cf3063910'::uuid,'marketplace_browse','fine:rings','Rings','{}'::jsonb,'9d21180c-d691-8463-a75f-eb612863b7a1'::uuid,0),
('5e68aa17-7cde-8cdd-acff-33a3945de621'::uuid,'marketplace_browse','fine:necklaces','Necklaces','{}'::jsonb,'9d21180c-d691-8463-a75f-eb612863b7a1'::uuid,1),
('f45299d0-066a-8267-a267-b2fab523ed58'::uuid,'marketplace_browse','fine:earrings','Earrings','{}'::jsonb,'9d21180c-d691-8463-a75f-eb612863b7a1'::uuid,2),
('33a54bba-e21f-8b84-a27c-6c9e48c16771'::uuid,'marketplace_browse','fine:bracelets','Bracelets','{}'::jsonb,'9d21180c-d691-8463-a75f-eb612863b7a1'::uuid,3),
('ce92f611-356a-885e-a804-9158d2af946a'::uuid,'marketplace_browse','department:books_art','Books & Art','{}'::jsonb,null,4),
('de33eeef-9aa3-848b-aba3-5af4db8b38e2'::uuid,'marketplace_browse','group:books','Books','{}'::jsonb,'ce92f611-356a-885e-a804-9158d2af946a'::uuid,0),
('19c4353a-cf92-8503-a76b-6b1d4824cdf5'::uuid,'marketplace_browse','fine:fiction','Fiction','{}'::jsonb,'de33eeef-9aa3-848b-aba3-5af4db8b38e2'::uuid,0),
('976d7ec0-2adf-887b-ad19-e32990727f95'::uuid,'marketplace_browse','fine:memoir','Memoir & biography','{}'::jsonb,'de33eeef-9aa3-848b-aba3-5af4db8b38e2'::uuid,1),
('0a6aceeb-1b66-8c7c-af3e-b48df870cd28'::uuid,'marketplace_browse','fine:poetry','Poetry','{}'::jsonb,'de33eeef-9aa3-848b-aba3-5af4db8b38e2'::uuid,2),
('051a41fc-5434-85ce-abf3-b7218b26e33e'::uuid,'marketplace_browse','fine:comics','Comics & graphic novels','{}'::jsonb,'de33eeef-9aa3-848b-aba3-5af4db8b38e2'::uuid,3),
('6f6e94bc-8ff2-846a-a919-5627cbaa275c'::uuid,'marketplace_browse','fine:zines_magazines','Zines & magazines','{}'::jsonb,'de33eeef-9aa3-848b-aba3-5af4db8b38e2'::uuid,4),
('fdec8f81-0f5c-8fe7-ab79-46f703042f7c'::uuid,'marketplace_browse','fine:kids_ya','Kids & YA','{}'::jsonb,'de33eeef-9aa3-848b-aba3-5af4db8b38e2'::uuid,5),
('a53b4140-a0e0-8e69-a772-94989e4d29b4'::uuid,'marketplace_browse','fine:nonfiction','Nonfiction','{}'::jsonb,'de33eeef-9aa3-848b-aba3-5af4db8b38e2'::uuid,6),
('8de2df62-13cc-8b51-a142-228044ab10e1'::uuid,'marketplace_browse','group:art','Art','{}'::jsonb,'ce92f611-356a-885e-a804-9158d2af946a'::uuid,1),
('b2ee56e8-f95e-89fd-aac9-be6adf7e46c9'::uuid,'marketplace_browse','fine:prints_posters','Prints & posters','{}'::jsonb,'8de2df62-13cc-8b51-a142-228044ab10e1'::uuid,0),
('d78b85b7-65ff-8c72-aaf3-5c28576c1a01'::uuid,'marketplace_browse','fine:cards_stationery','Cards & stationery','{}'::jsonb,'8de2df62-13cc-8b51-a142-228044ab10e1'::uuid,1),
('94c2def9-6e17-8786-a8d4-1543f107c6d9'::uuid,'marketplace_browse','fine:photography','Photography','{}'::jsonb,'8de2df62-13cc-8b51-a142-228044ab10e1'::uuid,2),
('4f41308c-9b87-8ad9-a173-cb2edfcfb97e'::uuid,'marketplace_browse','group:film','Film','{}'::jsonb,'ce92f611-356a-885e-a804-9158d2af946a'::uuid,2),
('27fc280d-1834-8586-a6d5-7498c088752c'::uuid,'marketplace_browse','group:calendars','Calendars','{}'::jsonb,'ce92f611-356a-885e-a804-9158d2af946a'::uuid,3),
('69ef438a-450d-89ba-ad64-c544f49c4059'::uuid,'marketplace_browse','department:home','Home & Living','{}'::jsonb,null,5),
('bfd562f2-b914-864c-afcc-010e5eb0dca4'::uuid,'marketplace_browse','group:home_goods','Home goods','{}'::jsonb,'69ef438a-450d-89ba-ad64-c544f49c4059'::uuid,0),
('01a0b5e0-0106-886f-acba-032b1709eec2'::uuid,'marketplace_browse','department:hygiene','Hygiene & Care','{}'::jsonb,null,6),
('712baf80-06a7-8989-a8c1-ba91971b74b1'::uuid,'marketplace_browse','group:grooming','Grooming','{}'::jsonb,'01a0b5e0-0106-886f-acba-032b1709eec2'::uuid,0),
('f1057ee2-c0fb-8f6d-a78c-c513ae42efa4'::uuid,'marketplace_browse','fine:fragrance','Fragrance','{}'::jsonb,'712baf80-06a7-8989-a8c1-ba91971b74b1'::uuid,0),
('59005a7b-486a-8121-a962-3ef88472934f'::uuid,'marketplace_browse','fine:soap_bath','Soap & bath','{}'::jsonb,'712baf80-06a7-8989-a8c1-ba91971b74b1'::uuid,1),
('59654de6-c63f-88dc-ad72-ee7ceb86c38c'::uuid,'marketplace_browse','fine:shave_beard','Shave & beard','{}'::jsonb,'712baf80-06a7-8989-a8c1-ba91971b74b1'::uuid,2),
('de424a8b-ecb0-8b9e-a6e7-91198f90dfcd'::uuid,'marketplace_browse','fine:skincare','Skincare','{}'::jsonb,'712baf80-06a7-8989-a8c1-ba91971b74b1'::uuid,3),
('0cc8b237-660e-8e94-a99e-62b5aa6080fb'::uuid,'marketplace_browse','fine:aphrodisiacs','Aphrodisiacs & libido','{}'::jsonb,'712baf80-06a7-8989-a8c1-ba91971b74b1'::uuid,4),
('62693b70-013b-861b-ae02-2e488aa297ee'::uuid,'marketplace_browse','fine:edible_massage','Edible & massage','{}'::jsonb,'712baf80-06a7-8989-a8c1-ba91971b74b1'::uuid,5),
('3b58d957-f0c1-8936-a420-2e767248ee02'::uuid,'marketplace_browse','department:intimacy','Intimacy','{}'::jsonb,null,7),
('23aaef1d-c277-8190-afb6-843fc90378e3'::uuid,'marketplace_browse','group:sex_toys','Sex toys','{}'::jsonb,'3b58d957-f0c1-8936-a420-2e767248ee02'::uuid,0),
('fae66a45-485f-8c30-afae-c573d37f4f83'::uuid,'marketplace_browse','fine:strap_ons','Strap-ons','{}'::jsonb,'23aaef1d-c277-8190-afb6-843fc90378e3'::uuid,0),
('b8720356-a82c-8259-ace0-8dd160ebac14'::uuid,'marketplace_browse','fine:packers_stp','Packers & STP','{}'::jsonb,'23aaef1d-c277-8190-afb6-843fc90378e3'::uuid,1),
('53a706ca-230b-8b10-a44d-1f1b7c35ea7d'::uuid,'marketplace_browse','fine:nipple_play','Nipple play','{}'::jsonb,'23aaef1d-c277-8190-afb6-843fc90378e3'::uuid,2),
('7a6ede39-3b31-84d0-a21b-66711ae176f3'::uuid,'marketplace_browse','fine:estim','E-stim','{}'::jsonb,'23aaef1d-c277-8190-afb6-843fc90378e3'::uuid,3),
('be294c52-113b-8027-a690-b58f0280b25b'::uuid,'marketplace_browse','fine:sounding','Sounding','{}'::jsonb,'23aaef1d-c277-8190-afb6-843fc90378e3'::uuid,4),
('b8090365-ece8-8a3d-acb5-d1b57afd469a'::uuid,'marketplace_browse','fine:kegel','Kegel','{}'::jsonb,'23aaef1d-c277-8190-afb6-843fc90378e3'::uuid,5),
('df84c34e-a45e-8ba2-af95-44c38169e12f'::uuid,'marketplace_browse','fine:sex_machines','Sex machines','{}'::jsonb,'23aaef1d-c277-8190-afb6-843fc90378e3'::uuid,6),
('72e38ff3-f8f9-88aa-ab7c-37cd52234b0d'::uuid,'marketplace_browse','fine:dolls','Dolls','{}'::jsonb,'23aaef1d-c277-8190-afb6-843fc90378e3'::uuid,7),
('4bb0da2b-b496-82cd-a29e-fe3a3019e727'::uuid,'marketplace_browse','fine:tongue_oral','Tongue & oral','{}'::jsonb,'23aaef1d-c277-8190-afb6-843fc90378e3'::uuid,8),
('c32d55d6-b70c-803d-a328-8231a24b1495'::uuid,'marketplace_browse','fine:couples_dp','Couples & double','{}'::jsonb,'23aaef1d-c277-8190-afb6-843fc90378e3'::uuid,9),
('678e6d1a-cf3d-867d-aa4f-6316f0c2d3c2'::uuid,'marketplace_browse','group:dildos','Dildos','{}'::jsonb,'3b58d957-f0c1-8936-a420-2e767248ee02'::uuid,1),
('c8e6c14e-dc44-8ffd-a654-ec5bc6b3f6af'::uuid,'marketplace_browse','fine:fantasy_dildos','Fantasy','{}'::jsonb,'678e6d1a-cf3d-867d-aa4f-6316f0c2d3c2'::uuid,0),
('b9c68b55-53f5-847a-a277-a4d1cc47fc23'::uuid,'marketplace_browse','fine:realistic_dildos','Realistic','{}'::jsonb,'678e6d1a-cf3d-867d-aa4f-6316f0c2d3c2'::uuid,1),
('2389faaa-ea5e-84d6-a2f7-433ccada40e6'::uuid,'marketplace_browse','fine:double_dildos','Double-ended','{}'::jsonb,'678e6d1a-cf3d-867d-aa4f-6316f0c2d3c2'::uuid,2),
('c1ef004f-7f6b-8de7-a61f-5fc7d1d8e9f1'::uuid,'marketplace_browse','group:anal_toys','Anal toys','{}'::jsonb,'3b58d957-f0c1-8936-a420-2e767248ee02'::uuid,2),
('46022a8c-e328-890e-aab5-a635ee96c53f'::uuid,'marketplace_browse','fine:butt_plugs','Butt plugs','{}'::jsonb,'c1ef004f-7f6b-8de7-a61f-5fc7d1d8e9f1'::uuid,0),
('b9f94e75-8194-824b-a24a-0de73f029855'::uuid,'marketplace_browse','fine:anal_beads','Anal beads','{}'::jsonb,'c1ef004f-7f6b-8de7-a61f-5fc7d1d8e9f1'::uuid,1),
('f32e800c-3760-8d6e-a7bc-92d94922c8d8'::uuid,'marketplace_browse','fine:prostate','Prostate','{}'::jsonb,'c1ef004f-7f6b-8de7-a61f-5fc7d1d8e9f1'::uuid,2),
('41550684-bb29-801f-a6b5-f59070a14371'::uuid,'marketplace_browse','fine:dilators','Dilators & training','{}'::jsonb,'c1ef004f-7f6b-8de7-a61f-5fc7d1d8e9f1'::uuid,3),
('165b4cd9-155c-8fe4-a46a-3c4d01ac9374'::uuid,'marketplace_browse','fine:anal_hooks','Anal hooks','{}'::jsonb,'c1ef004f-7f6b-8de7-a61f-5fc7d1d8e9f1'::uuid,4),
('1a46c6f4-c9b4-852f-ad91-f8b56544c690'::uuid,'marketplace_browse','group:masturbators','Masturbators','{}'::jsonb,'3b58d957-f0c1-8936-a420-2e767248ee02'::uuid,3),
('29308404-b371-816f-ac8f-f771f726e513'::uuid,'marketplace_browse','group:vibrators','Vibrators','{}'::jsonb,'3b58d957-f0c1-8936-a420-2e767248ee02'::uuid,4),
('1ac8a080-e767-8780-aee6-3e07b030b57f'::uuid,'marketplace_browse','fine:wands','Wands','{}'::jsonb,'29308404-b371-816f-ac8f-f771f726e513'::uuid,0),
('7ef47210-9296-8fa3-accc-4bb52f3ce89b'::uuid,'marketplace_browse','fine:rabbits','Rabbits','{}'::jsonb,'29308404-b371-816f-ac8f-f771f726e513'::uuid,1),
('08ad19e1-102f-8fe9-aeb3-cd0525f215b8'::uuid,'marketplace_browse','fine:egg_vibrators','Egg vibrators','{}'::jsonb,'29308404-b371-816f-ac8f-f771f726e513'::uuid,2),
('b49928aa-55e8-82b5-a98f-60ad46e9d6db'::uuid,'marketplace_browse','fine:bullets','Bullets','{}'::jsonb,'29308404-b371-816f-ac8f-f771f726e513'::uuid,3),
('733944b5-f1f5-8206-a027-b7878544e3e5'::uuid,'marketplace_browse','fine:air_pulse','Air-pulse & suction','{}'::jsonb,'29308404-b371-816f-ac8f-f771f726e513'::uuid,4),
('61833d84-686e-8a04-a0a8-60252a901009'::uuid,'marketplace_browse','fine:thrusting','Thrusting','{}'::jsonb,'29308404-b371-816f-ac8f-f771f726e513'::uuid,5),
('524eb8a5-5175-8c9e-adc1-4c8de838fe12'::uuid,'marketplace_browse','fine:g_spot','G-spot','{}'::jsonb,'29308404-b371-816f-ac8f-f771f726e513'::uuid,6),
('0c8e263a-cad3-88eb-acce-c383e11e3b7b'::uuid,'marketplace_browse','fine:clit_stimulators','Clitoral','{}'::jsonb,'29308404-b371-816f-ac8f-f771f726e513'::uuid,7),
('7b0077b7-6330-8e71-af23-47ecfc9141e5'::uuid,'marketplace_browse','fine:wearable_vibes','Wearable & panty','{}'::jsonb,'29308404-b371-816f-ac8f-f771f726e513'::uuid,8),
('cb569308-336d-8d63-a910-4264b06df764'::uuid,'marketplace_browse','fine:app_controlled','App & remote','{}'::jsonb,'29308404-b371-816f-ac8f-f771f726e513'::uuid,9),
('acf833bb-63e5-8138-aef4-d1764c08e0cf'::uuid,'marketplace_browse','group:cock_rings','Cock rings','{}'::jsonb,'3b58d957-f0c1-8936-a420-2e767248ee02'::uuid,5),
('9c769780-0e47-82a1-ab4e-86abc07b72b2'::uuid,'marketplace_browse','fine:penis_sleeves','Sleeves & sheaths','{}'::jsonb,'acf833bb-63e5-8138-aef4-d1764c08e0cf'::uuid,0),
('d36f96a4-b782-8c08-aa66-53a852c7d15d'::uuid,'marketplace_browse','group:chastity','Chastity','{}'::jsonb,'3b58d957-f0c1-8936-a420-2e767248ee02'::uuid,6),
('5ebe146b-3c9b-8b0c-ae29-1b23b76d29ad'::uuid,'marketplace_browse','group:pumps','Pumps','{}'::jsonb,'3b58d957-f0c1-8936-a420-2e767248ee02'::uuid,7),
('e7bb2b02-4f83-8222-a7fa-4be89cb9aaea'::uuid,'marketplace_browse','group:lubes','Lubes','{}'::jsonb,'3b58d957-f0c1-8936-a420-2e767248ee02'::uuid,8),
('bb467ff0-1928-8ffc-a070-239f602c95bf'::uuid,'marketplace_browse','group:poppers','Poppers','{}'::jsonb,'3b58d957-f0c1-8936-a420-2e767248ee02'::uuid,9),
('6a138686-bcbb-8284-a82f-a514f133f9f6'::uuid,'marketplace_browse','group:safer_sex','Safer sex','{}'::jsonb,'3b58d957-f0c1-8936-a420-2e767248ee02'::uuid,10),
('d0621044-eae9-835e-ad98-19fbf034d04f'::uuid,'marketplace_browse','fine:douching_enemas','Douching & enemas','{}'::jsonb,'6a138686-bcbb-8284-a82f-a514f133f9f6'::uuid,0),
('34be574c-63d4-8860-a85f-ce9c42328bc9'::uuid,'marketplace_browse','department:bdsm_fetish','BDSM & Fetish','{}'::jsonb,null,8),
('8a91272d-e5db-8bf8-ad33-752dd2b5fd28'::uuid,'marketplace_browse','group:fetish_gear','Fetish gear','{}'::jsonb,'34be574c-63d4-8860-a85f-ce9c42328bc9'::uuid,0),
('721e55b8-df13-8291-a0a3-95ec6d6487dc'::uuid,'marketplace_browse','fine:latex','Latex','{}'::jsonb,'8a91272d-e5db-8bf8-ad33-752dd2b5fd28'::uuid,0),
('459a4054-c6f4-833f-ad34-2e45df224531'::uuid,'marketplace_browse','fine:leather','Leather','{}'::jsonb,'8a91272d-e5db-8bf8-ad33-752dd2b5fd28'::uuid,1),
('79067853-6d17-8ec7-a0de-ac1394aaecf4'::uuid,'marketplace_browse','fine:rubber_neoprene','Rubber & neoprene','{}'::jsonb,'8a91272d-e5db-8bf8-ad33-752dd2b5fd28'::uuid,2),
('8156a295-19f5-8136-a780-37a93fce4c1f'::uuid,'marketplace_browse','fine:uniforms','Uniforms','{}'::jsonb,'8a91272d-e5db-8bf8-ad33-752dd2b5fd28'::uuid,3),
('c3e35ebc-6989-8b97-a781-97f22d43dd58'::uuid,'marketplace_browse','group:bondage','Bondage','{}'::jsonb,'34be574c-63d4-8860-a85f-ce9c42328bc9'::uuid,1),
('204ad5e8-f993-81a7-a59f-d1f2ffd92e7e'::uuid,'marketplace_browse','fine:rope','Rope & shibari','{}'::jsonb,'c3e35ebc-6989-8b97-a781-97f22d43dd58'::uuid,0),
('e1058961-2e77-85a3-a306-46bdb8304fc1'::uuid,'marketplace_browse','fine:cuffs_restraints','Cuffs & restraints','{}'::jsonb,'c3e35ebc-6989-8b97-a781-97f22d43dd58'::uuid,1),
('04fa919a-ecfc-8dca-a7f5-9d878aaadb34'::uuid,'marketplace_browse','fine:spreader_bars','Spreader bars','{}'::jsonb,'c3e35ebc-6989-8b97-a781-97f22d43dd58'::uuid,2),
('143ee4de-abaf-8d67-aa96-ff7638dd5313'::uuid,'marketplace_browse','fine:slings_furniture','Slings & furniture','{}'::jsonb,'c3e35ebc-6989-8b97-a781-97f22d43dd58'::uuid,3),
('2c0d028b-b18a-809b-a9ae-03ff8df274ef'::uuid,'marketplace_browse','group:impact_play','Impact play','{}'::jsonb,'34be574c-63d4-8860-a85f-ce9c42328bc9'::uuid,2),
('0bf2dac3-60e6-821a-a919-c90d02021dfb'::uuid,'marketplace_browse','fine:cbt','CBT','{}'::jsonb,'2c0d028b-b18a-809b-a9ae-03ff8df274ef'::uuid,0),
('0f6dc89d-102b-8205-a2f0-02c1cdf04ed4'::uuid,'marketplace_browse','group:harnesses','Harnesses','{}'::jsonb,'34be574c-63d4-8860-a85f-ce9c42328bc9'::uuid,3),
('4fdef4bd-eec3-8bf4-ad12-305200dc33a1'::uuid,'marketplace_browse','group:collars','Collars','{}'::jsonb,'34be574c-63d4-8860-a85f-ce9c42328bc9'::uuid,4),
('df6ecee0-aa24-8439-ab35-bf1ada378ff9'::uuid,'marketplace_browse','group:gags','Gags','{}'::jsonb,'34be574c-63d4-8860-a85f-ce9c42328bc9'::uuid,5),
('fec10ccd-95f0-896b-a497-74ff88425886'::uuid,'marketplace_browse','group:hoods_masks','Hoods & masks','{}'::jsonb,'34be574c-63d4-8860-a85f-ce9c42328bc9'::uuid,6),
('05f633f2-c6d8-8c46-acb1-3418e73b03a4'::uuid,'marketplace_browse','group:pup_play','Pup & pet play','{}'::jsonb,'34be574c-63d4-8860-a85f-ce9c42328bc9'::uuid,7),
('ea6fb05b-4d5d-89b2-a0f6-5ea14d6e30de'::uuid,'marketplace_browse','department:services','Services','{}'::jsonb,null,9),
('625084a1-32a3-8b50-a8c7-4b75fe4c8acf'::uuid,'marketplace_browse','group:services','Services','{}'::jsonb,'ea6fb05b-4d5d-89b2-a0f6-5ea14d6e30de'::uuid,0),
('1876d25b-4eb1-8781-ad0f-4241cb7326a9'::uuid,'marketplace_browse','department:other','Other','{}'::jsonb,null,10),
('d3a2def2-8775-85a0-ad5e-61397f5b2de7'::uuid,'marketplace_browse','source:sex_toys','sex toys','{}'::jsonb,'3b58d957-f0c1-8936-a420-2e767248ee02'::uuid,0),
('259bdc8e-7d48-82f7-ada1-ea16ee927870'::uuid,'marketplace_browse','source:anal_toys','anal toys','{}'::jsonb,'3b58d957-f0c1-8936-a420-2e767248ee02'::uuid,0),
('17dd017f-02a3-8fbc-a891-5bca9b580945'::uuid,'marketplace_browse','source:cock_rings_and_stretchers','cock rings and stretchers','{}'::jsonb,'3b58d957-f0c1-8936-a420-2e767248ee02'::uuid,0),
('0ab83e47-5169-8602-a5b0-be28410bb5e5'::uuid,'marketplace_browse','source:pumps_and_enlargement','pumps and enlargement','{}'::jsonb,'3b58d957-f0c1-8936-a420-2e767248ee02'::uuid,0),
('221bf0c7-9660-8004-aa93-4ba3fbf7573d'::uuid,'marketplace_browse','source:chastity','chastity','{}'::jsonb,'3b58d957-f0c1-8936-a420-2e767248ee02'::uuid,0),
('7cb2beab-c379-828f-abeb-33b3a53b1721'::uuid,'marketplace_browse','source:bdsm_and_bondage','bdsm and bondage','{}'::jsonb,'34be574c-63d4-8860-a85f-ce9c42328bc9'::uuid,0),
('75d00ccf-4b6d-8f17-a8fe-020db5b33f53'::uuid,'marketplace_browse','source:fetish_wear','fetish wear','{}'::jsonb,'34be574c-63d4-8860-a85f-ce9c42328bc9'::uuid,0),
('630517bb-a3f7-8796-a6e5-3f71a608361b'::uuid,'marketplace_browse','source:fetish_gear','fetish gear','{}'::jsonb,'34be574c-63d4-8860-a85f-ce9c42328bc9'::uuid,0),
('064813d8-b507-8d64-a557-f579f31b998d'::uuid,'marketplace_browse','source:pup_and_pet_play','pup and pet play','{}'::jsonb,'34be574c-63d4-8860-a85f-ce9c42328bc9'::uuid,0),
('8dae4134-0cdd-8624-acc7-e774a9078860'::uuid,'marketplace_browse','source:underwear_and_swimwear','underwear and swimwear','{}'::jsonb,'76b895db-5cb4-8ba4-a891-4316fd721b90'::uuid,0),
('b0ee6997-709a-8262-a325-34d3be4ed8a9'::uuid,'marketplace_browse','source:underwear','underwear','{}'::jsonb,'76b895db-5cb4-8ba4-a891-4316fd721b90'::uuid,0),
('9dc1b801-3f51-8d4b-a2f4-70e8cc13e374'::uuid,'marketplace_browse','source:lingerie','lingerie','{}'::jsonb,'76b895db-5cb4-8ba4-a891-4316fd721b90'::uuid,0),
('a577ea23-a31b-8ea4-a944-3065ff259d4f'::uuid,'marketplace_browse','source:swimwear','swimwear','{}'::jsonb,'92d4dff3-3e96-8331-aa81-243f78b5b387'::uuid,0),
('6277f14a-8e6d-86cf-acd9-456fb3aad832'::uuid,'marketplace_browse','source:apparel_and_accessories','apparel and accessories','{}'::jsonb,'5e012458-9ad0-8f9d-a3c4-16e433bdbc42'::uuid,0),
('3b40f507-c55e-8180-a79f-87a718f97029'::uuid,'marketplace_browse','source:apparel','apparel','{}'::jsonb,'5e012458-9ad0-8f9d-a3c4-16e433bdbc42'::uuid,0),
('7f6f622e-e8da-8bcb-af2d-339415812661'::uuid,'marketplace_browse','source:accessories','accessories','{}'::jsonb,'5e012458-9ad0-8f9d-a3c4-16e433bdbc42'::uuid,0),
('1a9e3e7a-4762-8b06-ad2f-0c98fc8360d6'::uuid,'marketplace_browse','source:jewelry_and_pins','jewelry and pins','{}'::jsonb,'adbd45fa-2bf2-850c-a264-17bcc346739d'::uuid,0),
('c4763c7f-32b1-8f2f-a597-e01f9a8da84f'::uuid,'marketplace_browse','source:jewelry','jewelry','{}'::jsonb,'adbd45fa-2bf2-850c-a264-17bcc346739d'::uuid,0),
('f89a3fb7-58e1-8f9e-af01-ea4364b88cb7'::uuid,'marketplace_browse','source:books_and_art','books and art','{}'::jsonb,'ce92f611-356a-885e-a804-9158d2af946a'::uuid,0),
('47ae5886-c4a1-8309-adfa-93ff6a765508'::uuid,'marketplace_browse','source:books','books','{}'::jsonb,'ce92f611-356a-885e-a804-9158d2af946a'::uuid,0),
('c03da040-c16c-8929-a773-0b509e7dacd4'::uuid,'marketplace_browse','source:art','art','{}'::jsonb,'ce92f611-356a-885e-a804-9158d2af946a'::uuid,0),
('1a19c4b1-b701-8c16-af07-646b50a500f5'::uuid,'marketplace_browse','source:hygiene_and_care','hygiene and care','{}'::jsonb,'01a0b5e0-0106-886f-acba-032b1709eec2'::uuid,0),
('660beac6-3a03-8280-aca3-0b91e2adf775'::uuid,'marketplace_browse','source:hygiene','hygiene','{}'::jsonb,'01a0b5e0-0106-886f-acba-032b1709eec2'::uuid,0),
('e466a58e-bb2a-8494-a034-c8a2bfb6ddb3'::uuid,'marketplace_browse','source:mental_health','mental health','{}'::jsonb,'ea6fb05b-4d5d-89b2-a0f6-5ea14d6e30de'::uuid,0),
('01ec4a4e-12a1-8198-aef7-96c78ff7156b'::uuid,'marketplace_browse','source:personal_training','personal training','{}'::jsonb,'ea6fb05b-4d5d-89b2-a0f6-5ea14d6e30de'::uuid,0),
('3b0d6db8-8861-8196-a14c-ed824c31039d'::uuid,'marketplace_browse','source:event_planning','event planning','{}'::jsonb,'ea6fb05b-4d5d-89b2-a0f6-5ea14d6e30de'::uuid,0),
('814e72de-fe43-89c8-ad80-6acbe1cbed02'::uuid,'marketplace_occasion','occ-pride','Pride','{}'::jsonb,null,0),
('9bba93e2-8151-8af5-a0af-9fd6dea0667d'::uuid,'marketplace_occasion','occ-drag','Drag','{}'::jsonb,null,1),
('24a3f6bf-2129-8704-a76d-f601031229ec'::uuid,'marketplace_occasion','occ-wedding','Wedding','{}'::jsonb,null,2),
('1443a9fd-819a-8df4-ad19-8d3cddd4395e'::uuid,'marketplace_occasion','occ-everyday','Everyday','{}'::jsonb,null,3),
('f1866b69-3abb-835b-ac9d-863eda42ef8b'::uuid,'marketplace_size','xxs','XXS','{}'::jsonb,null,0),
('f74976b0-30db-8efd-a936-b50a7916e7f4'::uuid,'marketplace_size','xs','XS','{}'::jsonb,null,1),
('0d087ea0-89ec-8e81-a27c-5b114d94443b'::uuid,'marketplace_size','s','S','{}'::jsonb,null,2),
('f7a772bd-de17-8f2d-af91-aec04db1b353'::uuid,'marketplace_size','m','M','{}'::jsonb,null,3),
('bbf1b4ac-7f92-8143-a767-5b303254b2d7'::uuid,'marketplace_size','l','L','{}'::jsonb,null,4),
('0eed660b-2bd2-8886-a061-35c0a04a2b7a'::uuid,'marketplace_size','xl','XL','{}'::jsonb,null,5),
('09f3493c-4a74-804a-a48d-3382bcf027cd'::uuid,'marketplace_size','2xl','2XL','{}'::jsonb,null,6),
('fb4a6140-fd85-8d18-a048-af6ca5207de9'::uuid,'marketplace_size','3xl','3XL','{}'::jsonb,null,7),
('8b9ab45c-c93f-82a1-a01a-ea1c174dc1cf'::uuid,'marketplace_size','4xl','4XL','{}'::jsonb,null,8),
('46f2364c-e5fe-8274-ae1a-55e138f0e334'::uuid,'marketplace_size','5xl','5XL','{}'::jsonb,null,9),
('e2bc46ec-5f6d-8bc6-af4f-5437d545a038'::uuid,'marketplace_size','one-size','ONE-SIZE','{}'::jsonb,null,10);

create function public.validate_reference_taxonomy() returns trigger
language plpgsql set search_path='' as $$
declare stripe jsonb; parent_value text; previous_parent uuid; parent_kind text;
begin
  if new.taxonomy='pride_flag' then
    if jsonb_typeof(new.metadata->'stripes') is distinct from 'array' then raise exception 'Flags require a stripes array.' using errcode='23514'; end if;
    if jsonb_array_length(new.metadata->'stripes') not between 1 and 32 then raise exception 'Flags require between 1 and 32 stripes.' using errcode='23514'; end if;
    for stripe in select jsonb_array_elements(new.metadata->'stripes') loop
      if coalesce(stripe->>'hex','') !~* '^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$' then raise exception 'Flag stripe colors must be hexadecimal.' using errcode='23514'; end if;
    end loop;
  elsif new.taxonomy='hanky_code' then
    if coalesce(new.metadata->>'hex','') !~* '^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$'
      or coalesce(new.metadata->>'tier','') not in ('classic','extended') or coalesce(btrim(new.metadata->>'meaningEn'),'')='' then
      raise exception 'Handkerchief reference entries require a color, meaning and classic or extended tier.' using errcode='23514';
    end if;
  elsif new.taxonomy='competition_category' then
    if new.value !~ '^[a-z][a-z0-9]*(_[a-z0-9]+)*$' then raise exception 'Competition category values use lowercase words separated by underscores.' using errcode='23514'; end if;
  elsif new.taxonomy='marketplace_browse' then
    if new.value !~ '^(department|group|fine|source):[a-z][a-z0-9_]*$' then raise exception 'Marketplace browse values start with department:, group:, fine: or source:.' using errcode='23514'; end if;
    if new.value like 'department:%' then
      if new.parent_id is not null then raise exception 'Marketplace departments have no parent.' using errcode='23514'; end if;
    else
      select value into parent_value from public.taxonomy_terms where id=new.parent_id and taxonomy=new.taxonomy;
      parent_kind := case when new.value like 'fine:%' then 'group:%' else 'department:%' end;
      if parent_value is null or parent_value not like parent_kind then raise exception 'Choose a parent at the preceding marketplace level.' using errcode='23514'; end if;
      if TG_OP='UPDATE' and new.value like 'fine:%' and new.parent_id is distinct from old.parent_id
        and exists(select 1 from public.marketplace_listings where subcategory_fine=split_part(new.value,':',2)) then
        raise exception 'This product type is in use. Reclassify its listings before moving it.' using errcode='23514';
      end if;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.validate_reference_taxonomy() from public;
create trigger validate_reference_taxonomy before insert or update on public.taxonomy_terms for each row execute function public.validate_reference_taxonomy();

-- Hierarchy is read at query time, preserving the existing classifiers themselves.
create or replace function public.marketplace_department_for_group(p_group text) returns text
language sql stable set search_path='' as $$
  select coalesce((select split_part(parent.value,':',2) from public.taxonomy_terms child
    join public.taxonomy_terms parent on parent.id=child.parent_id
    where child.taxonomy='marketplace_browse' and child.value='group:'||p_group and parent.value like 'department:%'), 'other')
$$;
create or replace function public.marketplace_department(p_subcategory text) returns text
language sql stable set search_path='' as $$
  select coalesce((select split_part(parent.value,':',2) from public.taxonomy_terms child
    join public.taxonomy_terms parent on parent.id=child.parent_id
    where child.taxonomy='marketplace_browse' and child.value='source:'||p_subcategory and parent.value like 'department:%'), 'other')
$$;
create or replace function public.marketplace_department(p_subcategory text,p_title text) returns text
language sql stable set search_path='' as $$
  select public.marketplace_department_for_group(public.marketplace_subcategory_group(p_subcategory,p_title))
$$;

alter table public.competitions drop constraint if exists competitions_category_check;
create trigger validate_managed_competition_category before insert or update on public.competitions for each row execute function public.validate_managed_classification('category','competition_category');
alter table public.competitions enable row level security;
grant select,insert,update on public.competitions to authenticated;
create policy competition_taxonomy_staff_insert on public.competitions for insert to authenticated with check (public.has_any_role_jwt(array['admin','moderator']::public.app_role[]));
create policy competition_taxonomy_staff_update on public.competitions for update to authenticated using (public.has_any_role_jwt(array['admin','moderator']::public.app_role[])) with check (public.has_any_role_jwt(array['admin','moderator']::public.app_role[]));
insert into public.content_versioned_tables(registry_key,table_name,enabled) values ('competitions','competitions',true) on conflict do nothing;
create trigger trg_content_revision after insert or update or delete on public.competitions for each row execute function public.log_content_revision();

-- Saved inactive flags are retained; new selections must use the managed list.
create function public.validate_managed_profile_flags() returns trigger
language plpgsql set search_path='' as $$
declare previous_flags text[] := '{}'; flag text;
begin
  if TG_OP='UPDATE' then previous_flags := coalesce(old.identity_flags,'{}'); end if;
  foreach flag in array coalesce(new.identity_flags,'{}') loop
    if flag=any(previous_flags) then continue; end if;
    if not exists(select 1 from public.taxonomy_terms where taxonomy='pride_flag' and value=flag and is_active) then
      raise exception 'Choose an active pride flag.' using errcode='23514';
    end if;
  end loop;
  return new;
end $$;
revoke all on function public.validate_managed_profile_flags() from public;
create trigger validate_managed_profile_flags before insert or update of identity_flags on public.profiles for each row execute function public.validate_managed_profile_flags();
-- Explicit staff taxonomy assignments survive the existing automatic classifier.
create or replace function public.marketplace_listings_derive_taxonomy() returns trigger
language plpgsql set search_path='' as $$
declare v_group text; v_core_group text; manual_assignment boolean := false;
begin
  if auth.uid() is not null and public.has_any_role_jwt(array['admin','moderator']::public.app_role[]) then
    if TG_OP='INSERT' then manual_assignment := new.subcategory_group is not null or new.subcategory_fine is not null;
    else manual_assignment := new.subcategory_group is distinct from old.subcategory_group
      or new.subcategory_fine is distinct from old.subcategory_fine or old.taxonomy_classifier_version='manual'; end if;
  end if;
  if manual_assignment then
    new.department := public.marketplace_department_for_group(new.subcategory_group);
    new.taxonomy_v3_at := now(); new.taxonomy_version := 4; new.taxonomy_classifier_version := 'manual';
    return new;
  end if;
  if TG_OP='INSERT' or new.subcategory is distinct from old.subcategory or new.title is distinct from old.title
    or new.taxonomy_v3_at is null or (new.taxonomy_version>=4 and old.taxonomy_version<4) then
    v_group := public.marketplace_resolve_taxonomy_group(new.source_type,new.subcategory,new.title,new.attributes);
    v_core_group := public.marketplace_subcategory_group_v3(new.subcategory,new.title);
    new.subcategory_group := v_group;
    new.department := public.marketplace_department_for_group(v_group);
    new.subcategory_fine := case when v_group is distinct from v_core_group then null else public.marketplace_subcategory_fine(new.subcategory,new.title) end;
    new.taxonomy_v3_at := now(); new.taxonomy_version := 4; new.taxonomy_classifier_version := 'marketplace-taxonomy-v4';
  end if;
  return new;
end $$;

create function public.check_managed_marketplace_assignment() returns trigger
language plpgsql set search_path='' as $$
declare group_id uuid;
begin
  -- Automated sources retain their existing normalization contract.
  if auth.uid() is null then return new; end if;
  if TG_OP='UPDATE' and new.subcategory_group is not distinct from old.subcategory_group
    and new.subcategory_fine is not distinct from old.subcategory_fine then return new; end if;
  if new.subcategory_group is null or new.subcategory_group='other' then
    if new.subcategory_fine is not null then raise exception 'Choose a group before a product type.' using errcode='23514'; end if;
    return new;
  end if;
  select child.id into group_id from public.taxonomy_terms child join public.taxonomy_terms parent on parent.id=child.parent_id
    where child.taxonomy='marketplace_browse' and child.value='group:'||new.subcategory_group and child.is_active and parent.is_active;
  if group_id is null then raise exception 'Choose an active marketplace browse group.' using errcode='23514'; end if;
  if new.subcategory_fine is not null and not exists(select 1 from public.taxonomy_terms where taxonomy='marketplace_browse'
    and value='fine:'||new.subcategory_fine and parent_id=group_id and is_active) then
    raise exception 'Choose an active product type belonging to this group.' using errcode='23514';
  end if;
  new.department := public.marketplace_department_for_group(new.subcategory_group);
  return new;
end $$;
revoke all on function public.check_managed_marketplace_assignment() from public;
create trigger zz_check_managed_marketplace_assignment before insert or update on public.marketplace_listings for each row execute function public.check_managed_marketplace_assignment();

-- A group move reclassifies cached departments as one transaction. This narrowly
-- privileged trigger is needed because taxonomy moderators cannot edit listings.
create schema if not exists taxonomy_private;
revoke all on schema taxonomy_private from public;
create function taxonomy_private.sync_managed_marketplace_department() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.taxonomy='marketplace_browse' and new.value like 'group:%' and new.parent_id is distinct from old.parent_id then
    if auth.uid() is not null and not public.has_any_role_jwt(array['admin','moderator']::public.app_role[]) then raise exception 'Moderator role required.' using errcode='42501'; end if;
    update public.marketplace_listings set department=public.marketplace_department_for_group(subcategory_group)
      where subcategory_group=split_part(new.value,':',2) and department is distinct from public.marketplace_department_for_group(subcategory_group);
  end if;
  return null;
end $$;
revoke all on function taxonomy_private.sync_managed_marketplace_department() from public;
create trigger sync_managed_marketplace_department after update of parent_id on public.taxonomy_terms for each row execute function taxonomy_private.sync_managed_marketplace_department();
create policy competition_taxonomy_staff_read on public.competitions for select to authenticated using (public.has_any_role_jwt(array['admin','moderator']::public.app_role[]));
notify pgrst,'reload schema';
commit;
