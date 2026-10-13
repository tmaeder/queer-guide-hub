import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { personAuthorCandidate } from './news-author.ts';

Deno.test('rejects non-person credits supplied by the reported feeds', () => {
  for (const value of ['Editors', 'EDITOR', 'https://www.facebook.com/6030918854', 'Big Money Players Network and iHeartPodcasts', 'Dyking Out - a Lesbian and LGBTQ Podcast for Everyone!', 'Redaktion', 'newsroom', 'editorial team']) {
    assertEquals(personAuthorCandidate(value), null, value);
  }
  assertEquals(personAuthorCandidate('Example Magazine', ['Example Magazine']), null);
});
Deno.test('preserves international names, mononyms and explicitly credited people', () => {
  for (const value of ['Cher', '李明', 'José Muñoz', 'J. Smith', "O’Brien", 'Casey Tanner, Sarah York']) assertEquals(personAuthorCandidate(value), value);
  assertEquals(personAuthorCandidate('By Alex Doe'), 'Alex Doe');
  assertEquals(personAuthorCandidate('Alex Doe https://example.com/alex'), 'Alex Doe');
  assertEquals(personAuthorCandidate('["Alex Doe", "Editors", "Jane Smith"]'), 'Alex Doe, Jane Smith');
  assertEquals(personAuthorCandidate(['Alex Doe', 'Editors']), 'Alex Doe');
});
Deno.test('separates explicitly named contributors from known production companies', () => {
  assertEquals(personAuthorCandidate('Ashley Gavin & Studio71'), 'Ashley Gavin');
  assertEquals(personAuthorCandidate('Sony Music Entertainment / Jonathan Van Ness'), 'Jonathan Van Ness');
  assertEquals(personAuthorCandidate('Queer Theology / Brian G. Murphy & Shannon T.L. Kearns'), 'Brian G. Murphy & Shannon T.L. Kearns');
  assertEquals(personAuthorCandidate('Chosen Family & Studio71', ['Chosen Family']), null);
  for (const value of ['Redazione Gay.it', 'Out.com Editors', 'BlazeTV Staff', 'New York Post', 'foxnews', 'MIM', 'headtopics.com']) assertEquals(personAuthorCandidate(value), null);
});
Deno.test('email addresses with a parenthesized credit are not person names', () => {
  assertEquals(personAuthorCandidate('editors@example.com (The Week US)'), null);
});
