declare module 'react-simple-maps' {
  import type { ComponentType, ReactNode } from 'react'
  export const ComposableMap: ComponentType<any>
  export const Geographies: ComponentType<{ geography: any; children: (arg: { geographies: any[] }) => ReactNode }>
  export const Geography: ComponentType<any>
  export const ZoomableGroup: ComponentType<any>
  export const Sphere: ComponentType<any>
  export const Graticule: ComponentType<any>
}
declare module 'world-atlas/countries-110m.json' {
  const value: any
  export default value
}
