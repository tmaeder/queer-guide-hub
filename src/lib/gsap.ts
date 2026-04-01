// ─── Lazy GSAP initializer ───────────────────────────────────────────────────
// Imports GSAP + plugins on first call, registers plugins once.
// All GSAP usage in the app should go through this module.

import gsap from 'gsap';

let pluginsRegistered = false;

export async function initGsapPlugins() {
  if (pluginsRegistered) return gsap;

  const [{ ScrollTrigger }, { Flip }] = await Promise.all([
    import('gsap/ScrollTrigger'),
    import('gsap/Flip'),
  ]);

  gsap.registerPlugin(ScrollTrigger, Flip);
  pluginsRegistered = true;
  return gsap;
}

export { gsap };
export type { default as GSAPType } from 'gsap';
