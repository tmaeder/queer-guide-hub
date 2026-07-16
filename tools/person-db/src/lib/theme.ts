export type Theme = 'light' | 'dark'

const KEY = 'person-db.theme'

// Stored choice, else follow the OS preference.
export function currentTheme(): Theme {
  const s = localStorage.getItem(KEY)
  if (s === 'light' || s === 'dark') return s
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(t: Theme): void {
  document.documentElement.dataset.theme = t
  localStorage.setItem(KEY, t)
}
