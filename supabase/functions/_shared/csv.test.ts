import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { parseCsv, parseCsvRows } from './csv.ts'

Deno.test('parseCsv handles quoted commas', () => {
  const rows = parseCsv('id,name,desc\n1,"Harness, leather","Soft, adjustable"')
  assertEquals(rows, [{ id: '1', name: 'Harness, leather', desc: 'Soft, adjustable' }])
})

Deno.test('parseCsv handles escaped quotes and CRLF', () => {
  const rows = parseCsv('a,b\r\n"say ""hi""",2\r\n')
  assertEquals(rows, [{ a: 'say "hi"', b: '2' }])
})

Deno.test('parseCsv handles newlines inside quoted fields', () => {
  const rows = parseCsv('a,b\n"line1\nline2",x')
  assertEquals(rows, [{ a: 'line1\nline2', b: 'x' }])
})

Deno.test('parseCsvRows skips blank lines, keeps short rows padded via parseCsv', () => {
  assertEquals(parseCsvRows('a,b\n\n1,2\n'), [['a', 'b'], ['1', '2']])
  assertEquals(parseCsv('a,b\n1\n'), [{ a: '1', b: '' }])
})
