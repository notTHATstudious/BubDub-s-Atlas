import { useEffect, useRef, useState } from 'react'
import { applyTheme, resolveTheme, saveChoice, savedChoice, type ThemeChoice } from './theme'

const CHOICES: { id: ThemeChoice; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'Auto' },
]

/** ☰ button with a small settings panel (appearance for now). */
export function SettingsMenu({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState(false)
  const [choice, setChoice] = useState<ThemeChoice>(savedChoice)
  const box = useRef<HTMLDivElement>(null)

  // Close on a tap outside or Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function pick(c: ThemeChoice) {
    setChoice(c)
    saveChoice(c)
    applyTheme(resolveTheme(c))
  }

  return (
    <div ref={box} className={className}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="Settings"
        aria-expanded={open}
        className="flex h-10 w-10 items-center justify-center rounded-full text-ink/80 hover:bg-sand/40"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      {open && (
        <div role="dialog" aria-label="Settings" className="absolute right-0 top-12 z-20 w-60 rounded-2xl border border-line bg-white p-4 text-left shadow-lg">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted">Settings</p>
          <p className="mt-3 text-sm font-medium">Dark mode</p>
          <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-page p-1" role="radiogroup" aria-label="Dark mode">
            {CHOICES.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={choice === c.id}
                onClick={() => pick(c.id)}
                className={`rounded-lg py-1.5 text-sm ${choice === c.id ? 'bg-white font-semibold shadow-sm' : 'text-muted hover:text-ink'}`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">Auto follows your phone's setting.</p>
        </div>
      )}
    </div>
  )
}
