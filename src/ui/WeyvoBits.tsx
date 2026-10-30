import { useState } from 'react'
import { WEYVO_URL, weyvoBack } from './weyvo'

/** A slim bar back to Weyvo, shown only when Atlas was opened from Weyvo. */
export function WeyvoBar() {
  const [back] = useState(weyvoBack)
  if (!back) return null
  return (
    <a href={back} className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-pine px-4 py-2.5 text-sm font-semibold text-cream"
      style={{ paddingTop: 'max(0.625rem, env(safe-area-inset-top))' }}>
      <span aria-hidden="true">←</span> Back to Weyvo
    </a>
  )
}

/** "by weyvo" under the BubDub's Atlas name, in Weyvo's own wordmark: bold lowercase with the gold pin. */
export function ByWeyvo() {
  return (
    <a href={WEYVO_URL} aria-label="by Weyvo" className="mt-1 inline-flex items-baseline gap-1.5 text-muted hover:text-ink">
      <span className="text-xs">by</span>
      <span className="inline-flex items-baseline text-ink" style={{ fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", fontWeight: 800, fontSize: 20, letterSpacing: '-0.03em', lineHeight: 1 }}>
        weyvo
        <svg viewBox="0 0 16 22" aria-hidden="true" style={{ width: '0.34em', height: 'calc(0.34em * 1.375)', marginLeft: '0.07em', alignSelf: 'flex-end', marginBottom: '0.06em' }}>
          <defs>
            <radialGradient id="weyvo-pin-gold" cx="0.35" cy="0.25" r="0.85">
              <stop offset="0" stopColor="#FFF1C4" />
              <stop offset="0.35" stopColor="#F2C566" />
              <stop offset="0.75" stopColor="#D9982F" />
              <stop offset="1" stopColor="#A9711C" />
            </radialGradient>
          </defs>
          <path d="M8 21.5C8 21.5 1 13.6 1 8.5a7 7 0 1 1 14 0C15 13.6 8 21.5 8 21.5Z" fill="url(#weyvo-pin-gold)" />
          <circle cx="8" cy="8.3" r="2.6" fill="#FBF7EF" />
        </svg>
      </span>
    </a>
  )
}

const HIDE_KEY = 'tp-weyvo-invite-hidden'

/** Turn trips into stories: a gentle invite to Weyvo, hidden for 14 days once dismissed. */
export function WeyvoInvite() {
  const [hidden, setHidden] = useState(() => {
    try {
      return !!weyvoBack() || Date.now() - Number(localStorage.getItem(HIDE_KEY) ?? 0) < 14 * 86_400_000
    } catch {
      return false
    }
  })
  if (hidden) return null
  return (
    <section aria-label="Weyvo" className="mt-6 rounded-2xl border border-line bg-white/70 px-4 py-4 text-sm leading-relaxed">
      <p className="font-semibold">Back from a trip? Tell the story on Weyvo</p>
      <p className="mt-1 text-muted">Weyvo turns your photos and memories into a travel magazine, with a map of everywhere you've been. Made by the people behind BubDub's Atlas.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={`${WEYVO_URL}/?ref=atlas`} className="rounded-full bg-pine px-4 py-1.5 text-xs font-semibold text-cream hover:bg-pine/90">Open Weyvo</a>
        <button
          onClick={() => {
            setHidden(true)
            try {
              localStorage.setItem(HIDE_KEY, String(Date.now()))
            } catch {
              // Fine: it shows again next visit.
            }
          }}
          className="rounded-full border border-line px-4 py-1.5 text-xs text-muted hover:bg-white"
        >
          Not now
        </button>
      </div>
    </section>
  )
}
