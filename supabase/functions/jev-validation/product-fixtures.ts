import { buildProductRelevanceRequest } from '../_shared/jev-product-relevance.ts'

// Fixed before first inference: eight development probes, sixteen held-out
// records. Labels describe the supplied synthetic public text, not real products.
const cases = [
  ['pride-flag', 'LGBTQ Pride flag', 'A classic six-stripe LGBTQ Pride flag, made of woven polyester and measuring 90 by 150 cm.', 'approve'],
  ['rainbow-umbrella', 'Rainbow umbrella', 'A multicolor rainbow umbrella for rainy weather, with an automatic opening mechanism and a sturdy steel frame.', 'reject'],
  ['queer-history', 'Queer history book', 'An illustrated book about LGBTQ community history and the lives of queer activists in Europe.', 'approve'],
  ['blank-diary', 'Hardcover notebook', 'A plain ruled notebook with a blue cover and 120 blank pages for everyday writing and school notes.', 'reject'],
  ['binder', 'Gender-affirming chest binder', 'A chest binder designed to affirm gender expression by creating a flatter chest silhouette. Hand wash and air dry.', 'approve'],
  ['travel-packer', 'Travel packing cubes', 'A set of packing cubes for organizing clothes inside a suitcase. Three zippered fabric containers are included.', 'reject'],
  ['lesbian-toy', 'Intimacy toy for lesbian couples', 'A sex toy explicitly designed for sexual stimulation for lesbian couples. This is an adult intimacy product.', 'review'],
  ['generic-toy', 'Mini vibrator', 'An adult vibrator for sexual stimulation, with three speeds, a rechargeable battery and a travel storage pouch.', 'reject'],
  ['bi-pin', 'Bisexual Pride enamel pin', 'An enamel pin displaying the pink, purple and blue bisexual Pride flag. Includes a metal clasp.', 'approve'],
  ['trans-flag', 'Transgender Pride flag', 'A blue, pink and white transgender Pride flag for displaying support for trans people at community events.', 'approve'],
  ['pronoun-cards', 'Gender-affirming pronoun cards', 'Cards displaying they/them, she/her and he/him pronouns, designed to affirm gender expression at LGBTQ community gatherings.', 'approve'],
  ['grammar-cards', 'English pronoun flashcards', 'Grammar flashcards for learning English personal pronouns and practicing sentence structure in primary school.', 'reject'],
  ['drag-wig', 'Ballroom drag performance wig', 'A sculpted stage wig created specifically for queer ballroom and drag performances. Store it on a wig stand.', 'approve'],
  ['costume-wig', 'Purple costume wig', 'A purple synthetic wig for general fancy-dress parties and Halloween costumes. Includes an adjustable cap.', 'reject'],
  ['queer-film', 'Queer cinema DVD collection', 'Three documentary films about LGBTQ lives, queer community spaces and Pride celebrations, supplied on DVD.', 'approve'],
  ['fiction-romance', 'A love story between two men', 'A novel following the romance of two fictional men as they build a life together in a small coastal town.', 'approve'],
  ['brand-claim', 'Plain cotton shirt', 'A plain white cotton shirt. The manufacturer describes its brand as LGBTQ owned. Machine washable at 30 degrees.', 'review'],
  ['brand-name', 'RainbowCo cotton shirt', 'A plain white cotton shirt from the brand RainbowCo. Available in sizes S to XXL and machine washable at 30 degrees.', 'reject'],
  ['medical-claim', 'Pride supplement', 'An LGBTQ Pride-themed supplement. The seller claims these capsules treat HIV infection and prevent illness.', 'review'],
  ['legal-claim', 'LGBTQ asylum handbook', 'A handbook about LGBTQ asylum. It states that all gay applicants have an automatic legal right to asylum in Country X.', 'review'],
  ['german-pride', 'Lesbische Pride-Fahne', 'Eine lesbische Pride-Fahne für Sichtbarkeit und Solidarität mit lesbischen Menschen. Aus Polyester, 90 mal 150 cm.', 'approve'],
  ['french-generic', 'Sac de sport', 'Un sac de sport noir en coton avec deux poignées et une poche intérieure, pour transporter les vêtements et les chaussures.', 'reject'],
  ['spanish-queer', 'Historias de mujeres lesbianas', 'Una colección de relatos ficticios sobre la vida y el amor de mujeres lesbianas en varias ciudades de España.', 'approve'],
  ['german-sports', 'Sport-Kompressionshemd', 'Ein Kompressionshemd für sportliches Training. Es sitzt eng am Körper und besteht aus atmungsaktivem Polyester.', 'reject'],
] as const

export const PRODUCT_FIXTURES = Object.fromEntries(cases.map(([name, title, text, expected], i) => [
  `product-${name}`, { request: buildProductRelevanceRequest({ title, text }), expected, split: i < 8 ? 'development' : 'held_out' },
]))
