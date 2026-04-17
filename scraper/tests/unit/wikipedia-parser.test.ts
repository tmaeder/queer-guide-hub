import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WikipediaConnector } from '../../src/sources/wikipedia.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sampleHtml = readFileSync(join(__dirname, '../fixtures/wikipedia_sample.html'), 'utf-8');

describe('WikipediaConnector parser', () => {
  let connector: WikipediaConnector;

  beforeEach(() => {
    connector = new WikipediaConnector();
  });

  it('parses gay villages from sample HTML', async () => {
    // Mock the fetch to return our fixture HTML (rendered Wikipedia article)
    const mockFetch = vi.spyOn(connector as any, 'fetch').mockResolvedValue({
      url: 'https://en.wikipedia.org/wiki/List_of_gay_villages',
      status: 200,
      body: sampleHtml,
      contentType: 'text/html',
      hash: 'abc123',
      fetchedAt: new Date(),
      blockedByRobots: false,
    });

    const entities = await connector.fetchDetail(
      'https://en.wikipedia.org/wiki/List_of_gay_villages',
    );

    expect(entities.length).toBeGreaterThan(0);

    // Check that we found US entries
    const usEntities = entities.filter((e) => e.raw_data.country === 'United States');
    expect(usEntities.length).toBeGreaterThanOrEqual(3);

    // Check The Castro
    const castro = entities.find((e) => (e.raw_data.name as string)?.includes('Castro'));
    expect(castro).toBeDefined();
    expect(castro!.entity_type).toBe('place');
    expect(castro!.raw_data.wikipedia_url).toContain('/wiki/The_Castro');

    // Check that "See also" section was skipped
    const lgbtCulture = entities.find((e) => (e.raw_data.name as string)?.includes('LGBT culture'));
    expect(lgbtCulture).toBeUndefined();

    // Check European entries
    const soho = entities.find((e) => (e.raw_data.name as string)?.includes('Soho'));
    expect(soho).toBeDefined();
    expect(soho!.raw_data.country).toBe('United Kingdom');

    // Check German entries
    const schoeneberg = entities.find((e) => (e.raw_data.name as string)?.includes('Schöneberg'));
    expect(schoeneberg).toBeDefined();
    expect(schoeneberg!.raw_data.country).toBe('Germany');

    mockFetch.mockRestore();
  });

  it('handles robots.txt blocking', async () => {
    vi.spyOn(connector as any, 'fetch').mockResolvedValue({
      url: 'test',
      status: 0,
      body: '',
      contentType: '',
      hash: '',
      fetchedAt: new Date(),
      blockedByRobots: true,
    });

    const entities = await connector.fetchDetail('https://test.com');
    expect(entities).toEqual([]);
  });

  it('handles API errors gracefully', async () => {
    vi.spyOn(connector as any, 'fetch').mockResolvedValue({
      url: 'test',
      status: 500,
      body: 'Internal Server Error',
      contentType: 'text/plain',
      hash: '',
      fetchedAt: new Date(),
      blockedByRobots: false,
    });

    const entities = await connector.fetchDetail('https://test.com');
    expect(entities).toEqual([]);
  });
});
