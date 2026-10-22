import { useEffect, useId, useMemo, useState } from 'react'
import { geocode, type GeoResult } from '../live'

// A text field that suggests places as you type: the curated names first,
// then OpenStreetMap matches. Picking an OSM match pins its exact location,
// so "Aurangabad, Maharashtra" isn't confused with the one in Bihar.

interface Suggestion {
  name: string
  label?: string
  geo?: GeoResult
}

interface Props {
  label: string
  value: string
  onChange: (name: string, geo?: GeoResult) => void
  known: string[]
  placeholder?: string
  autoFocus?: boolean
  onRemove?: () => void
}

export function PlaceInput({ label, value, onChange, known, placeholder, autoFocus, onRemove }: Props) {
  const [open, setOpen] = useState(false)
  const [remote, setRemote] = useState<{ q: string; list: GeoResult[] }>({ q: '', list: [] })
  const [active, setActive] = useState(-1)
  const listId = useId()
  const [typed, setTyped] = useState(false)
  const q = value.trim().toLowerCase()

  useEffect(() => {
    if (!typed || q.length < 2) return
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const list = await geocode(q, 5)
        if (!cancelled) setRemote({ q, list })
      } catch {
        // Offline or the geocoder is busy: local suggestions still work.
      }
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [q, typed])

  const items = useMemo<Suggestion[]>(() => {
    if (q.length < 2) return []
    const local: Suggestion[] = known.filter((n) => n.toLowerCase().startsWith(q) && n.toLowerCase() !== q).slice(0, 4).map((name) => ({ name }))
    if (remote.q !== q) return local
    const seen = new Set(local.map((s) => s.name.toLowerCase()))
    const fromMap = remote.list.filter((g) => !seen.has(g.name.toLowerCase())).map((g) => ({ name: g.name, label: g.label, geo: g }))
    return [...local, ...fromMap].slice(0, 7)
  }, [q, known, remote])

  function pick(s: Suggestion) {
    setTyped(false)
    onChange(s.name, s.geo)
    setOpen(false)
    setActive(-1)
  }

  const showList = open && typed && items.length > 0

  return (
    <div className="relative">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
        <div className="flex items-center gap-1 rounded-xl border border-line bg-white focus-within:border-pine">
          <input
            className="w-full bg-transparent px-3 py-2.5 text-[15px] outline-none placeholder:text-muted/60"
            value={value}
            placeholder={placeholder}
            autoFocus={autoFocus}
            autoComplete="off"
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            onChange={(e) => {
              setTyped(true)
              onChange(e.target.value)
              setOpen(true)
              setActive(-1)
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onKeyDown={(e) => {
              if (!showList) return
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((a) => Math.min(items.length - 1, a + 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((a) => Math.max(0, a - 1))
              } else if (e.key === 'Enter' && active >= 0) {
                e.preventDefault()
                pick(items[active])
              } else if (e.key === 'Escape') {
                setOpen(false)
              }
            }}
          />
          {onRemove && (
            <button type="button" onClick={onRemove} aria-label={`Remove ${value || 'stop'}`} className="mr-1 rounded-lg px-2 py-1 text-lg leading-none text-muted hover:bg-cream hover:text-clay">
              ×
            </button>
          )}
        </div>
      </label>
      {showList && (
        <ul id={listId} role="listbox" className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-line bg-white shadow-lg shadow-ink/5">
          {items.map((s, i) => (
            <li
              key={`${s.name}-${s.label ?? 'known'}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(s)
              }}
              className={`cursor-pointer px-3 py-2 text-sm ${i === active ? 'bg-sage/10' : 'hover:bg-cream'}`}
            >
              <span className="font-medium">{s.name}</span>
              {s.label ? <span className="ml-2 text-xs text-muted">{s.label}</span> : <span className="ml-2 text-xs text-sage">curated</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
