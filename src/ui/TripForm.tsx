import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { INTERESTS, type Interest } from '../data/types'
import { knownPlaceNames, type TransportPref, type TravelStyle } from '../engine'
import { daysBetween } from '../engine/dates'
import type { FormState } from './form'
import { validate } from './form'
import { PlaceInput } from './PlaceInput'

interface Props {
  value: FormState
  onChange: (f: FormState) => void
  onSubmit: () => void
  loading: boolean
}

const STYLES: { id: TravelStyle; label: string; hint: string }[] = [
  { id: 'budget', label: 'Budget', hint: 'Trains, buses, simple stays' },
  { id: 'balanced', label: 'Balanced', hint: 'Comfort where it counts' },
  { id: 'premium', label: 'Premium', hint: 'Flights, cabs, nicer stays' },
]

const TRANSPORT: { id: TransportPref; label: string }[] = [
  { id: 'any', label: 'Any' },
  { id: 'train', label: 'Train' },
  { id: 'bus', label: 'Bus' },
  { id: 'flight', label: 'Flight' },
  { id: 'car', label: 'Road / own car' },
]

const INTEREST_LABEL: Record<Interest, string> = {
  nature: 'Nature',
  mountains: 'Mountains',
  trekking: 'Trekking',
  cafes: 'Cafés',
  adventure: 'Adventure',
  sightseeing: 'Sightseeing',
  beaches: 'Beaches',
  shopping: 'Shopping',
  relaxation: 'Relaxing',
}

const field = 'w-full rounded-xl border border-line bg-white px-3 py-2.5 text-[15px] outline-none focus:border-pine'

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  )
}

export function TripForm({ value: f, onChange, onSubmit, loading }: Props) {
  const [more, setMore] = useState(false)
  const [error, setError] = useState<string>()
  const known = useMemo(() => knownPlaceNames(), [])
  const set = (patch: Partial<FormState>) => onChange({ ...f, ...patch })

  const nights = f.departDate && f.returnDate ? daysBetween(f.departDate, f.returnDate) : 0
  const lengthHint = nights < 0 ? undefined : nights === 0 ? 'A day trip' : `${nights + 1} days, ${nights} ${nights === 1 ? 'night' : 'nights'} away`

  function submit(e: FormEvent) {
    e.preventDefault()
    const problem = validate(f)
    setError(problem)
    if (!problem) onSubmit()
  }

  return (
    <form onSubmit={submit} className="space-y-5 rounded-3xl border border-line bg-white/70 p-5 shadow-sm shadow-ink/5 sm:p-7">
      <div className="grid gap-4 sm:grid-cols-2">
        <PlaceInput label="Starting from" value={f.from.name} known={known.origins} placeholder="Mumbai" onChange={(name, geo) => set({ from: { name, geo } })} />
        <div className="space-y-2">
          {f.stops.map((s, i) => (
            <PlaceInput
              key={i}
              label={f.stops.length > 1 ? `Stop ${i + 1}` : 'Going to'}
              value={s.name}
              known={known.destinations}
              placeholder={i === 0 ? 'Manali, Spiti, Hampi…' : 'Next stop'}
              onChange={(name, geo) => set({ stops: f.stops.map((x, j) => (j === i ? { name, geo } : x)) })}
              onRemove={f.stops.length > 1 ? () => set({ stops: f.stops.filter((_, j) => j !== i) }) : undefined}
            />
          ))}
          {f.stops.length < 5 && (
            <button type="button" onClick={() => set({ stops: [...f.stops, { name: '' }] })} className="text-sm font-medium text-pine hover:underline">
              + Add another stop
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Leave home on">
          <input type="date" className={field} value={f.departDate} onChange={(e) => set({ departDate: e.target.value, returnDate: f.returnDate < e.target.value ? e.target.value : f.returnDate })} required />
        </Field>
        <Field label="Head back on" hint={lengthHint}>
          <input type="date" className={field} value={f.returnDate} min={f.departDate} onChange={(e) => set({ returnDate: e.target.value })} required />
        </Field>
      </div>

      <fieldset>
        <legend className="mb-2 text-xs font-medium text-muted">Travel style</legend>
        <div className="grid grid-cols-3 gap-2">
          {STYLES.map((s) => (
            <button
              type="button"
              key={s.id}
              onClick={() => set({ style: s.id })}
              aria-pressed={f.style === s.id}
              className={`rounded-2xl border px-3 py-3 text-left transition ${f.style === s.id ? 'border-pine bg-pine/10' : 'border-line bg-white hover:border-pine/40'}`}
            >
              <span className="block text-sm font-semibold">{s.label}</span>
              <span className="mt-0.5 hidden text-xs text-muted sm:block">{s.hint}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <button type="button" onClick={() => setMore(!more)} aria-expanded={more} className="flex items-center gap-2 text-sm font-medium text-muted hover:text-ink">
          <span className={`inline-block transition ${more ? 'rotate-90' : ''}`}>›</span>
          More options <span className="hidden font-normal sm:inline">(travellers, transport, interests, notes)</span>
        </button>
        {more && (
          <div className="mt-4 space-y-4 rounded-2xl bg-cream/70 p-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Travellers">
                <input type="number" min={1} max={30} className={field} value={f.travellers} onChange={(e) => set({ travellers: Math.max(1, Number(e.target.value) || 1) })} />
              </Field>
              <Field label="Leave home at" hint="Optional">
                <input type="time" className={field} value={f.departTime} onChange={(e) => set({ departTime: e.target.value })} />
              </Field>
              <Field label="Head back at" hint="Optional">
                <input type="time" className={field} value={f.returnTime} onChange={(e) => set({ returnTime: e.target.value })} />
              </Field>
            </div>
            <Field label="Preferred transport">
              <select className={field} value={f.transport} onChange={(e) => set({ transport: e.target.value as TransportPref })}>
                {TRANSPORT.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </Field>
            <fieldset>
              <legend className="mb-2 text-xs font-medium text-muted">Interests</legend>
              <div className="flex flex-wrap gap-2">
                {INTERESTS.map((it) => {
                  const on = f.interests.includes(it)
                  return (
                    <button
                      type="button"
                      key={it}
                      aria-pressed={on}
                      onClick={() => set({ interests: on ? f.interests.filter((x) => x !== it) : [...f.interests, it] })}
                      className={`rounded-full border px-3 py-1.5 text-sm transition ${on ? 'border-pine/50 bg-sand/70 text-ink' : 'border-line bg-white text-muted hover:border-sand'}`}
                    >
                      {INTEREST_LABEL[it]}
                    </button>
                  )
                })}
              </div>
            </fieldset>
            <Field label="Notes" hint="Name places you don't want to miss and they'll be added.">
              <textarea rows={2} className={field} value={f.notes} placeholder="Must see Chandratal, slow mornings…" onChange={(e) => set({ notes: e.target.value })} />
            </Field>
          </div>
        )}
      </div>

      {error && <p className="rounded-xl bg-clay/10 px-3 py-2 text-sm text-clay">{error}</p>}

      <button disabled={loading} className="w-full rounded-2xl bg-pine py-3.5 text-[15px] font-semibold text-cream transition hover:bg-pine/90 disabled:opacity-60">
        {loading ? 'Finding places and planning…' : 'Plan my trip'}
      </button>
    </form>
  )
}
