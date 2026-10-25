import { useEffect, useState } from 'react'
import { currentInstallKind } from './install'

const DISMISSED = 'tp-install-dismissed'

interface InstallPrompt extends Event {
  prompt: () => Promise<void>
}

const wasDismissed = () => {
  try {
    return localStorage.getItem(DISMISSED) === '1'
  } catch {
    return false
  }
}

/** "Add to Home Screen" help for people using the website on a phone. */
export function InstallHint() {
  const [kind] = useState(currentInstallKind)
  const [hidden, setHidden] = useState(wasDismissed)
  const [prompt, setPrompt] = useState<InstallPrompt>()

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setPrompt(e as InstallPrompt)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  if (hidden || kind === 'none' || (kind === 'android' && !prompt)) return null

  const dismiss = () => {
    setHidden(true)
    try {
      localStorage.setItem(DISMISSED, '1')
    } catch {
      // Fine: it will show again next visit.
    }
  }

  return (
    <section aria-label="Install the app" className="mb-5 flex items-start gap-3 rounded-2xl border border-line bg-white/70 px-4 py-3 text-sm leading-relaxed">
      <div className="flex-1">
        <p className="font-semibold">Use it like an app</p>
        {kind === 'ios' ? (
          <p className="mt-0.5 text-muted">
            Tap the <b>Share</b> button (the square with an arrow, in Safari's bottom bar or Chrome's address bar), then <b>Add to Home Screen</b>. It opens full screen, with no browser bar, and your saved trips work offline.
          </p>
        ) : (
          <>
            <p className="mt-0.5 text-muted">Add it to your home screen: full screen, and your saved trips work offline.</p>
            <button
              onClick={() => {
                void prompt?.prompt()
                setPrompt(undefined)
              }}
              className="mt-2 rounded-full bg-pine px-4 py-1.5 text-xs font-semibold text-cream hover:bg-pine/90"
            >
              Install app
            </button>
          </>
        )}
      </div>
      <button onClick={dismiss} aria-label="Hide this tip" className="-mr-1 rounded-full px-2 py-1 text-muted hover:bg-sand/60">✕</button>
    </section>
  )
}
