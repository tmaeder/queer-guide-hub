import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { splitAuthor } from './book-title.ts'

// All `title_by` inputs below are real display titles read from gaystheword.co.uk's
// live JSON-LD on 2026-08-02; the `title_colon` ones from queerbooks.ch.

Deno.test('splitAuthor title_by: plain "Title by Author"', () => {
  assertEquals(splitAuthor('25 Days in Athens by Jack Strange', 'title_by'),
    { title: '25 Days in Athens', author: 'Jack Strange' })
  assertEquals(splitAuthor('100 Boyfriends by Brontez Purnell', 'title_by'),
    { title: '100 Boyfriends', author: 'Brontez Purnell' })
})

Deno.test('splitAuthor title_by: strips the binding suffix off the author', () => {
  assertEquals(splitAuthor('Detransition, Baby by Torrey Peters (Paperback)', 'title_by').author,
    'Torrey Peters')
  assertEquals(splitAuthor('Young Mungo by Douglas Stuart (Hardback)', 'title_by').author,
    'Douglas Stuart')
})

Deno.test('splitAuthor title_by: strips a dangling editorial connective', () => {
  // The first live row this crawler staged came out as
  // "100 Queer Poems, edited" / "Mary Jean Chan and Andrew McMillan (Paperback)".
  assertEquals(
    splitAuthor('100 Queer Poems, edited by Mary Jean Chan and Andrew McMillan (Paperback)', 'title_by'),
    { title: '100 Queer Poems', author: 'Mary Jean Chan and Andrew McMillan' })
})

Deno.test('splitAuthor title_by: splits on the LAST " by ", not the first', () => {
  // A lazy quantifier yields "A Room" / "the Sea by Jane Doe".
  assertEquals(splitAuthor('A Room by the Sea by Jane Doe', 'title_by'),
    { title: 'A Room by the Sea', author: 'Jane Doe' })
})

Deno.test('splitAuthor: no pattern match leaves the title intact, author null', () => {
  assertEquals(splitAuthor('Untitled With No Author', 'title_by'),
    { title: 'Untitled With No Author', author: null })
  assertEquals(splitAuthor('Some Title', undefined),
    { title: 'Some Title', author: null })
  assertEquals(splitAuthor('', 'title_by'), { title: '', author: null })
})

Deno.test('splitAuthor title_colon: "Surname, Firstname: Work" -> "Firstname Surname"', () => {
  assertEquals(splitAuthor('Raffauf, Elisabeth: Stark gegen Mobbing', 'title_colon'),
    { title: 'Stark gegen Mobbing', author: 'Elisabeth Raffauf' })
  assertEquals(splitAuthor('Calafia, Patrick: Macho Sluts', 'title_colon'),
    { title: 'Macho Sluts', author: 'Patrick Calafia' })
})

Deno.test('splitAuthor: a mode never applies the other mode\'s pattern', () => {
  // A colon-shaped title under title_by must not be mangled by the " by " rule.
  assertEquals(splitAuthor('Raffauf, Elisabeth: Stark gegen Mobbing', 'title_by').author, null)
})
