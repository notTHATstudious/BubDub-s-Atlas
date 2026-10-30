// Light or dark colours. The person's choice is remembered on this device;
// "system" (the default) follows the phone's own setting.

export type Theme = 'light' | 'dark'
export type ThemeChoice = Theme | 'system'

const KEY = 'tp-theme'
const BAR: Record<Theme, string> = { light: '#374f4f', dark: '#14110f' }

export function savedChoice(): ThemeChoice {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    // Storage blocked: follow the phone.
  }
  return 'system'
}

export function resolveTheme(choice: ThemeChoice): Theme {
  if (choice !== 'system') return choice
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR[theme])
}

export function saveChoice(choice: ThemeChoice) {
  try {
    if (choice === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, choice)
  } catch {
    // Fine: it applies for this visit.
  }
}
