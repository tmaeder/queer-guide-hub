# Homepage LCP follow-up

The production mobile PageSpeed report kyhmd26fv6 scored 66 with FCP 4.2s,
LCP 6.2s, CLS 0, and 229 KiB unused JavaScript. Its LCP element was the hero
heading, with 2,300ms element render delay. Fonts already preload.

Keep the existing hero and primary navigation in the eager app graph. Move
content bands (and their data, motion, region and section dependencies) into a
separate HomeContent chunk, mounted within 200px of the viewport. Reserve one
viewport of height during loading and preserve section-level recovery.

Alternatives: preloading the entire old homepage still loads all section
code before the hero; server rendering would require a much broader routing,
i18n and hydration change. The targeted split removes the route waterfall
without altering copy or navigation. Cold-load route arrival opacity is also
skipped; subsequent in-app navigation retains the existing motion. The user authorized autonomous completion.

Validation: composition test for hero-before-content, build closure guard,
production desktop/mobile/localized navigation and search end-to-end tests,
and a fresh version-labelled PageSpeed audit after deployment.
