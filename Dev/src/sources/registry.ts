/**
 * Source registry.
 *
 * Maps source names to connector instances. Import here to ensure
 * connectors are instantiated exactly once.
 */
import { WikipediaConnector } from './wikipedia/index.js'
import { IgltaConnector } from './iglta/index.js'
import { OutsavvyConnector } from './outsavvy/index.js'
import { TravelGayConnector } from './travelgay/index.js'
import { PatrocConnector } from './patroc/index.js'
import { MisterBnBConnector } from './misterbandb/index.js'
import type { BaseConnector } from './base.js'
import type { SourceName } from '../utils/config.js'

type ConnectorMap = Record<SourceName, BaseConnector>

let _registry: ConnectorMap | null = null

export function getRegistry(): ConnectorMap {
  if (!_registry) {
    _registry = {
      wikipedia: new WikipediaConnector(),
      iglta: new IgltaConnector(),
      outsavvy: new OutsavvyConnector(),
      travelgay: new TravelGayConnector(),
      patroc: new PatrocConnector(),
      misterbandb: new MisterBnBConnector(),
    }
  }
  return _registry
}

export function getConnector(source: SourceName): BaseConnector {
  return getRegistry()[source]
}
