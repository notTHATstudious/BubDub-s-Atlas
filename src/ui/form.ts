import type { Interest } from '../data/types'
import type { DayEdit, TransportPref, TravelStyle, TripInput } from '../engine'
import { addDays } from '../engine/dates'
import type { GeoResult } from '../live'

export interface StopField {
  name: string
  geo?: GeoResult
}

export interface FormState {
  from: StopField
  stops: StopField[]
  departDate: string
  returnDate: string
  departTime: string
  returnTime: string
  travellers: number
  style: TravelStyle
  transport: TransportPref
  interests: Interest[]
  notes: string
  /** Edits made on the plan page. */
  excluded: string[]
  included: string[]
  customPlaces: { stopId: string; name: string }[]
  moves: Record<string, number>
}

const today = () => new Date().toISOString().slice(0, 10)

export function emptyForm(): FormState {
  const start = addDays(today(), 14)
  return {
    from: { name: '' },
    stops: [{ name: '' }],
    departDate: start,
    returnDate: addDays(start, 4),
    departTime: '',
    returnTime: '',
    travellers: 2,
    style: 'balanced',
    transport: 'any',
    interests: [],
    notes: '',
    excluded: [],
    included: [],
    customPlaces: [],
    moves: {},
  }
}

export function toInput(f: FormState): TripInput {
  return {
    from: f.from.name.trim(),
    stops: f.stops.map((s) => s.name.trim()).filter(Boolean),
    departDate: f.departDate,
    returnDate: f.returnDate,
    departTime: f.departTime || undefined,
    returnTime: f.returnTime || undefined,
    travellers: f.travellers,
    style: f.style,
    transport: f.transport,
    interests: f.interests.length ? f.interests : undefined,
    notes: f.notes.trim() || undefined,
    excludedPlaceIds: f.excluded,
    includedPlaceIds: f.included,
    customPlaces: f.customPlaces,
    moves: f.moves,
  }
}

/** Exact locations the person picked from suggestions, keyed by name. */
export function pickedPlaces(f: FormState): Record<string, GeoResult> {
  const out: Record<string, GeoResult> = {}
  for (const s of [f.from, ...f.stops]) if (s.geo && s.geo.name === s.name.trim()) out[s.name.trim()] = s.geo
  return out
}

export const MAX_TRAVELLERS = 30

/** The traveller count typed so far, or undefined while it isn't a valid number yet. */
export function parseTravellers(text: string): number | undefined {
  if (!/^\d+$/.test(text.trim())) return undefined
  const n = Number(text)
  return n >= 1 && n <= MAX_TRAVELLERS ? n : undefined
}

export function validate(f: FormState): string | undefined {
  if (!f.from.name.trim()) return 'Where are you starting from?'
  if (!f.stops.some((s) => s.name.trim())) return 'Add at least one destination.'
  if (!f.departDate || !f.returnDate) return 'Pick both dates.'
  if (f.returnDate < f.departDate) return 'The return date is before the start date.'
  return undefined
}

// Remember the trip for this visit only (sessionStorage), so a refresh while
// planning keeps it but opening the app again starts with a blank form.
const KEY = 'trip-planner:form'

export function loadForm(): FormState | undefined {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return undefined
    const f = { ...emptyForm(), ...JSON.parse(raw) } as FormState
    // Old dates are no use; keep the places and the trip length.
    if (f.departDate < today()) {
      const len = Math.max(0, Math.round((Date.parse(f.returnDate) - Date.parse(f.departDate)) / 86_400_000))
      f.departDate = addDays(today(), 14)
      f.returnDate = addDays(f.departDate, len)
    }
    return f
  } catch {
    return undefined
  }
}

export function saveForm(f: FormState) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(f))
  } catch {
    // Private mode or storage full: nothing to do.
  }
}

// A read-only share link carries the trip in the URL hash, so no server is
// needed. Opening it plans the same trip again.
export interface SharedTrip {
  form: FormState
  edits: Record<number, DayEdit>
}

export function shareLink(trip: SharedTrip): string {
  const bytes = new TextEncoder().encode(JSON.stringify(trip))
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  const code = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${location.origin}${location.pathname}#trip=${code}`
}

export function readShareLink(hash: string): SharedTrip | undefined {
  const m = /#trip=([\w-]+)/.exec(hash)
  if (!m) return undefined
  try {
    const bin = atob(m[1].replace(/-/g, '+').replace(/_/g, '/'))
    const json = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
    const t = JSON.parse(json) as SharedTrip
    return { form: { ...emptyForm(), ...t.form }, edits: t.edits ?? {} }
  } catch {
    return undefined
  }
}
