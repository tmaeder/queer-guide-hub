const FALLBACK_IMAGES = [
  '/images/fallback/eugene-golovesov--WHbksuuyd8-unsplash.webp',
  '/images/fallback/eugene-golovesov-q2JRA44k_sE-unsplash.webp',
  '/images/fallback/maria-orlova-bU8TeXhsPcY-unsplash.webp',
  '/images/fallback/pexels-anniroenkae-2832456.webp',
  '/images/fallback/pexels-didsss-2911544.webp',
  '/images/fallback/pexels-didsss-3107180.webp',
  '/images/fallback/pexels-didsss-3737718.webp',
  '/images/fallback/pexels-didsss-3906090.webp',
  '/images/fallback/pexels-diva-30278358.webp',
  '/images/fallback/pexels-diva-32962583.webp',
  '/images/fallback/pexels-merlin-11105656.webp',
  '/images/fallback/pexels-solenfeyissa-5450862.webp',
  '/images/fallback/solen-feyissa-VpcT2lx8vNA-unsplash.webp',
  '/images/fallback/solen-feyissa-oGjE-6MlGEc-unsplash.webp',
  '/images/fallback/susan-wilkinson-IsM1xDqN-a8-unsplash.webp',
  '/images/fallback/susan-wilkinson-l9URCYPsJPE-unsplash.webp',
  '/images/fallback/tengyart-9SyJhYYC2iI-unsplash.webp',
  '/images/fallback/vincent-nicolas-HU4JocRicp8-unsplash.webp',
  '/images/fallback/alexandru-ant-EHlp8e-nQ3g-unsplash.webp',
  '/images/fallback/alexandru-ant-ymXJgz_n8vk-unsplash.webp',
  '/images/fallback/eugene-golovesov-hSNFUafkKvM-unsplash.webp',
  '/images/fallback/pawel-czerwinski-BPrk2cOoCq8-unsplash.webp',
  '/images/fallback/pawel-czerwinski-GT2I5UgV218-unsplash.webp',
  '/images/fallback/pawel-czerwinski-JgWp9DNib3k-unsplash.webp',
  '/images/fallback/pawel-czerwinski-NTYYL9Eb9y8-unsplash.webp',
  '/images/fallback/pawel-czerwinski-W_mfoOi1Elc-unsplash.webp',
  '/images/fallback/pawel-czerwinski-qNe0H31x96I-unsplash.webp',
  '/images/fallback/solen-feyissa-cnp-52H9qzo-unsplash.webp',
] as const;

export function getRandomFallbackImage(): string {
  return FALLBACK_IMAGES[Math.floor(Math.random() * FALLBACK_IMAGES.length)];
}
