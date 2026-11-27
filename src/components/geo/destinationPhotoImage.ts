/**
 * The responsive image request a destination hero (city, country, queer
 * village) makes — shared by the component that renders it and the edge
 * middleware that preloads it.
 *
 * They must agree byte for byte. A `<link rel="preload" imagesrcset imagesizes>`
 * only helps when the browser picks the same candidate for the later `<img>`,
 * and it picks from these two values: change one side alone and the page pays
 * for the hero twice (the preload, then the image's own request). That is why
 * this file holds plain data and no imports — functions/ reads it directly.
 */
export const DESTINATION_PHOTO_SIZES = '(min-width: 1600px) 480px, (min-width: 1024px) 32vw, 92vw';

/** Candidate widths for the Cloudflare srcset (the `cover` role's set). */
export const DESTINATION_PHOTO_WIDTHS = [400, 800, 1200];
