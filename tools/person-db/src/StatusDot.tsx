import { personStatus } from './lib/status'
import type { Personality } from './types'

// Traffic-light dot: green=online, yellow=to-edit, red=blocked.
export function StatusDot({ p }: { p: Personality }) {
  const { status, label } = personStatus(p)
  return <span className={'status-dot ' + status} title={label} aria-label={label} />
}
