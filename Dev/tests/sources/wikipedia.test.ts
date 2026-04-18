import { describe, it, expect } from 'vitest'
import { parseGayVillages } from '../../src/sources/wikipedia/parser.js'

// Minimal representative HTML from the Wikipedia "List of gay villages" page.
// The real page has per-country sections with h2 headings followed by tables.
const MOCK_TABLE_HTML = `
<!DOCTYPE html>
<html>
<head><title>List of gay villages - Wikipedia</title></head>
<body>
<div id="content">
  <h1>List of gay villages</h1>
  <h2><span class="mw-headline">United Kingdom</span></h2>
  <table class="wikitable sortable">
    <thead>
      <tr><th>Name</th><th>City</th><th>Reference</th></tr>
    </thead>
    <tbody>
      <tr>
        <td><a href="/wiki/Village,_Manchester">Village</a></td>
        <td><a href="/wiki/Manchester">Manchester</a></td>
        <td></td>
      </tr>
      <tr>
        <td><a href="/wiki/Soho,_London">Soho</a></td>
        <td><a href="/wiki/London">London</a></td>
        <td></td>
      </tr>
    </tbody>
  </table>
  <h2><span class="mw-headline">France</span></h2>
  <table class="wikitable sortable">
    <thead>
      <tr><th>Name</th><th>City</th><th>Reference</th></tr>
    </thead>
    <tbody>
      <tr>
        <td><a href="/wiki/Le_Marais">Le Marais</a></td>
        <td><a href="/wiki/Paris">Paris</a></td>
        <td></td>
      </tr>
    </tbody>
  </table>
  <h2><span class="mw-headline">United States</span></h2>
  <table class="wikitable sortable">
    <thead>
      <tr><th>Name</th><th>City</th><th>Reference</th></tr>
    </thead>
    <tbody>
      <tr>
        <td><a href="/wiki/Castro_district">The Castro</a></td>
        <td><a href="/wiki/San_Francisco">San Francisco</a></td>
        <td></td>
      </tr>
    </tbody>
  </table>
</div>
</body>
</html>
`

const MOCK_LIST_HTML = `
<!DOCTYPE html>
<html>
<body>
  <div id="content">
    <h2>United Kingdom</h2>
    <ul>
      <li><a href="/wiki/Canal_Street,_Manchester">Canal Street</a> – Manchester</li>
      <li><a href="/wiki/Soho,_London">Soho</a> – London</li>
    </ul>
    <h2>Germany</h2>
    <ul>
      <li><a href="/wiki/Schöneberg">Schöneberg</a> – Berlin</li>
    </ul>
  </div>
</body>
</html>
`

describe('parseGayVillages – table format', () => {
  it('parses entities from wikitable', () => {
    const entities = parseGayVillages(MOCK_TABLE_HTML)
    expect(entities.length).toBe(4)
  })

  it('sets entityType to place', () => {
    const entities = parseGayVillages(MOCK_TABLE_HTML)
    expect(entities.every((e) => e.entityType === 'place')).toBe(true)
  })

  it('extracts name, city, country correctly', () => {
    const entities = parseGayVillages(MOCK_TABLE_HTML)
    const village = entities.find((e) => e.name === 'Village')
    expect(village).toBeDefined()
    expect(village?.city).toBe('Manchester')
    expect(village?.country).toBe('United Kingdom')
  })

  it('extracts Wikipedia URL', () => {
    const entities = parseGayVillages(MOCK_TABLE_HTML)
    const castro = entities.find((e) => e.name === 'The Castro')
    expect(castro?.wikipediaUrl).toContain('Castro_district')
  })

  it('sets source to wikipedia', () => {
    const entities = parseGayVillages(MOCK_TABLE_HTML)
    expect(entities.every((e) => e.source === 'wikipedia')).toBe(true)
  })

  it('includes lgbtq+ tags', () => {
    const entities = parseGayVillages(MOCK_TABLE_HTML)
    expect(entities.every((e) => e.tags.includes('lgbtq+'))).toBe(true)
  })
})

describe('parseGayVillages – list format fallback', () => {
  it('falls back to list-format parsing', () => {
    const entities = parseGayVillages(MOCK_LIST_HTML)
    expect(entities.length).toBeGreaterThan(0)
  })

  it('extracts country from headings', () => {
    const entities = parseGayVillages(MOCK_LIST_HTML)
    const uk = entities.filter((e) => e.country === 'United Kingdom')
    expect(uk.length).toBeGreaterThan(0)
  })
})
