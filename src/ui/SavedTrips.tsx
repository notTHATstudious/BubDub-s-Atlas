import { useState } from 'react'
import { deleteTrip, listTrips, type SavedTrip } from './store'

interface Props {
  onOpen: (trip: SavedTrip) => void
}

/** Trips saved on this phone; they open without a connection. */
export function SavedTrips({ onOpen }: Props) {
  const [trips, setTrips] = useState(listTrips)
  if (trips.length === 0) return null
  return (
    <section aria-label="Saved trips" className="mt-6 rounded-3xl border border-line bg-white/70 p-5">
      <h2 className="text-sm font-semibold">Saved trips</h2>
      <p className="mt-1 text-xs text-muted">Kept on this phone. They open even without internet.</p>
      <ul className="mt-3 divide-y divide-line">
        {trips.map((t) => (
          <li key={t.id} className="flex items-center gap-3 py-3">
            <button onClick={() => onOpen(t)} className="min-w-0 flex-1 text-left">
              <span className="block truncate text-sm font-medium">{t.label}</span>
              <span className="block text-xs text-muted">{t.dates}</span>
            </button>
            <button
              onClick={() => {
                if (!window.confirm(`Delete "${t.label}" from this phone?`)) return
                deleteTrip(t.id)
                setTrips(listTrips())
              }}
              aria-label={`Delete ${t.label}`}
              className="rounded-full px-3 py-1.5 text-xs text-muted hover:bg-clay/10 hover:text-clay"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
