# Remove a confirmed domain-parking advertisement

The public asset `https://static.hugedomains.com/images/hdv3-img/og_hugedomains.png` is a 1200×630 HugeDomains advertisement, visually checked after downloading it. Its SHA-256 is `f4a44de633692693bee635a0e4657058662e87749cf4ffa0d7ff33b80651b58a`. Eleven venues and three automatically created business identities carried this exact asset as their sole photo. This is not evidence that those businesses closed.

The existing staging image gate now rejects this exact hostname/path, including query variants, while retaining unrelated paths and lookalike hostnames. Seven image-gate tests pass. The code change still needs the normal release.

The operator SQL defaults to dry run and changes only the exact image in unverified venues without winning media provenance or retained human image revisions, and unclaimed automatically minted businesses without media ownership or retained human image revisions. All other images remain in order. Per-row assertions compare complete records and permit only images and native update/check cursor bookkeeping. Existing content revision triggers record the original image, system actor and replacement array. Source captures, quality findings, verification, publication and safety are not changed.

A production dry run selected 11 venues and three businesses. The real update passed its assertions inside a rolled-back transaction before the same bounded transaction committed all 14 changes. These removals are not counted as cleared findings: the native quality producer remains responsible for any newly exposed missing-media gap.
