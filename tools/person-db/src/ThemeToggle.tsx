import { useState } from 'react'
import { applyTheme, currentTheme, type Theme } from './lib/theme'

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => currentTheme())
  const flip = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    setTheme(next)
  }
  return (
    <button className="theme-toggle" onClick={flip} title={theme === 'dark' ? 'Zu Hell wechseln' : 'Zu Dunkel wechseln'}>
      {theme === 'dark' ? '☀' : '🌙'}
    </button>
  )
}
