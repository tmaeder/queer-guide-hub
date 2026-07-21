declare module 'react-simple-maps' {
  import type { ComponentType, ReactNode, CSSProperties, SVGProps } from 'react'

  export interface Geo {
    rsmKey: string
    id: string | number
    properties: { name?: string } & Record<string, unknown>
  }

  export const ComposableMap: ComponentType<{
    projection?: string
    projectionConfig?: Record<string, unknown>
    width?: number
    height?: number
    style?: CSSProperties
    children?: ReactNode
  }>
  export const Geographies: ComponentType<{
    geography: unknown
    children: (arg: { geographies: Geo[] }) => ReactNode
  }>
  export const Geography: ComponentType<
    {
      geography: Geo
      style?: Record<string, CSSProperties>
    } & Omit<SVGProps<SVGPathElement>, 'style'>
  >
  export const ZoomableGroup: ComponentType<{
    zoom?: number
    center?: [number, number]
    children?: ReactNode
  }>
  export const Sphere: ComponentType<{
    id?: string
    fill?: string
    stroke?: string
    strokeWidth?: number
  }>
  export const Graticule: ComponentType<{ stroke?: string; strokeWidth?: number }>
}
declare module 'world-atlas/countries-110m.json' {
  const value: unknown
  export default value
}
