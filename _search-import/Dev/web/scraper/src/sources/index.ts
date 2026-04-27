import type { SourceConnector } from '../types/connector.js';
import type { SourceName } from '../types/schemas.js';
import { WikipediaConnector } from './wikipedia.js';
import { IgltaConnector } from './iglta.js';
import { OutsavvyConnector } from './outsavvy.js';
import { TravelGayConnector } from './travelgay.js';
import { PatrocConnector } from './patroc.js';
import { MisterBnBConnector } from './misterbnb.js';

/** Registry of all source connectors */
const connectorRegistry: Record<SourceName, () => SourceConnector> = {
  wikipedia: () => new WikipediaConnector(),
  iglta: () => new IgltaConnector(),
  outsavvy: () => new OutsavvyConnector(),
  travelgay: () => new TravelGayConnector(),
  patroc: () => new PatrocConnector(),
  misterbnb: () => new MisterBnBConnector(),
};

/** Get a connector instance by source name */
export function getConnector(name: SourceName): SourceConnector {
  const factory = connectorRegistry[name];
  if (!factory) throw new Error(`Unknown source: ${name}`);
  return factory();
}

/** Get all connector instances */
export function getAllConnectors(): SourceConnector[] {
  return Object.values(connectorRegistry).map((factory) => factory());
}

/** Get all enabled connector instances */
export function getEnabledConnectors(): SourceConnector[] {
  return getAllConnectors().filter((c) => c.isEnabled());
}

export { WikipediaConnector, IgltaConnector, OutsavvyConnector, TravelGayConnector, PatrocConnector, MisterBnBConnector };
