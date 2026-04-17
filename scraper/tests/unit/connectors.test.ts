import { describe, it, expect } from 'vitest';
import { WikipediaConnector } from '../../src/sources/wikipedia.js';
import { IgltaConnector } from '../../src/sources/iglta.js';
import { OutsavvyConnector } from '../../src/sources/outsavvy.js';
import { TravelGayConnector } from '../../src/sources/travelgay.js';
import { PatrocConnector } from '../../src/sources/patroc.js';
import { MisterBnBConnector } from '../../src/sources/misterbnb.js';

describe('Connector configs', () => {
  it('WikipediaConnector has correct config', () => {
    const c = new WikipediaConnector();
    expect(c.config.name).toBe('wikipedia');
    expect(c.config.supportedTypes).toEqual(['place']);
    expect(c.config.requiresBrowser).toBe(false);
  });

  it('IgltaConnector has correct config', () => {
    const c = new IgltaConnector();
    expect(c.config.name).toBe('iglta');
    expect(c.config.supportedTypes).toEqual(['event']);
    expect(c.config.requiresBrowser).toBe(true);
    expect(c.config.crawlDelay).toBeGreaterThanOrEqual(2);
  });

  it('OutsavvyConnector has correct config', () => {
    const c = new OutsavvyConnector();
    expect(c.config.name).toBe('outsavvy');
    expect(c.config.supportedTypes).toEqual(['event']);
    expect(c.config.requiresBrowser).toBe(false);
    expect(c.config.sitemapUrl).toBe('https://www.outsavvy.com/sitemap.xml');
  });

  it('TravelGayConnector has correct config', () => {
    const c = new TravelGayConnector();
    expect(c.config.name).toBe('travelgay');
    expect(c.config.supportedTypes).toEqual(['venue', 'event']);
    expect(c.config.crawlDelay).toBeGreaterThanOrEqual(10);
  });

  it('PatrocConnector has correct config', () => {
    const c = new PatrocConnector();
    expect(c.config.name).toBe('patroc');
    expect(c.config.supportedTypes).toEqual(['venue', 'event']);
    expect(c.config.crawlDelay).toBeGreaterThanOrEqual(10);
    expect(c.config.disallowedPaths).toContain('/cgi-bin/');
  });

  it('MisterBnBConnector has correct config', () => {
    const c = new MisterBnBConnector();
    expect(c.config.name).toBe('misterbnb');
    expect(c.config.supportedTypes).toEqual(['stay']);
    expect(c.config.requiresBrowser).toBe(true);
    expect(c.config.disallowedPaths).toContain('/api/');
  });
});

describe('Connector kill switch', () => {
  it('respects kill switch env var', () => {
    const original = process.env.DISABLE_SOURCE_WIKIPEDIA;
    process.env.DISABLE_SOURCE_WIKIPEDIA = 'true';

    const c = new WikipediaConnector();
    expect(c.isEnabled()).toBe(false);

    // Restore
    if (original !== undefined) {
      process.env.DISABLE_SOURCE_WIKIPEDIA = original;
    } else {
      delete process.env.DISABLE_SOURCE_WIKIPEDIA;
    }
  });

  it('is enabled when kill switch is not set', () => {
    delete process.env.DISABLE_SOURCE_WIKIPEDIA;
    const c = new WikipediaConnector();
    expect(c.isEnabled()).toBe(true);
  });
});
