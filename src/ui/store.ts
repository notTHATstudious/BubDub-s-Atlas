import type { Destination } from '../data/types'
import type { DayEdit } from '../engine'
import type { Origin } from '../engine/geo'
import { findDestination, findOrigin } from '../engine/geo'
import type { TripInput } from '../engine'
import type { LiveResolved } from '../live'
import type { FormState } from './form'

// Two small stores in localStorage so the app is useful without a signal:
// - places looked up online, so they can be planned again offline;
// - whole trips the person saved, so they can be opened during the trip.
// Every read and write is guarded: storage can be blocked or full.

const PLACES_KEY = 'tp-places:v1'
const TRIPS_KEY = 'tp-trips:v1'
const PLACE_TTL_MS = 60 * 24 * 3600 * 1000
const MAX_PLACES = 60
export const MAX_SAVED_TRIPS = 20

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

// ---- Remembered places ----------------------------------------------------

interface Remembered {
  at: number
  dest?: Destination
  origin?: Origin
}

const nameKey = (s: string) => s.trim().toLowerCase()

/** Keeps the places found by an online lookup, for planning offline later. */
export function rememberPlaces(input: TripInput, r: LiveResolved) {
  const store = read<Record<string, Remembered>>(PLACES_KEY, {})
  const at = Date.now()
  input.stops.forEach((name, i) => {
    const d = r.stops[i]
    if (d && d.source === 'live') store[nameKey(name)] = { at, dest: d }
  })
  const origins: [string, Origin | undefined][] = [[input.from, r.origin], [input.returnTo ?? '', r.returnTo]]
  for (const [name, o] of origins) {
    if (name && o?.coords && !findOrigin(name).coords) store[`from:${nameKey(name)}`] = { at, origin: o }
  }
  const fresh = Object.entries(store)
    .filter(([, v]) => at - v.at < PLACE_TTL_MS)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, MAX_PLACES)
  write(PLACES_KEY, Object.fromEntries(fresh))
}

function recall(key: string): Remembered | undefined {
  const v = read<Record<string, Remembered>>(PLACES_KEY, {})[key]
  return v && Date.now() - v.at < PLACE_TTL_MS ? v : undefined
}

export const recallDestination = (name: string): Destination | undefined => findDestination(name) ?? recall(nameKey(name))?.dest
export const recallOrigin = (name: string): Origin => {
  const known = findOrigin(name)
  return known.coords ? known : (recall(`from:${nameKey(name)}`)?.origin ?? known)
}

// ---- Saved trips ----------------------------------------------------------

export interface SavedTrip {
  id: string
  savedAt: number
  /** Short label for the list, e.g. "Lonavala from Mumbai". */
  label: string
  /** e.g. "12 Nov – 15 Nov". */
  dates: string
  form: FormState
  edits: Record<number, DayEdit>
  /** Everything looked up for the trip, so it can be replanned without a signal. */
  resolved: LiveResolved
}

export const listTrips = (): SavedTrip[] => read<SavedTrip[]>(TRIPS_KEY, []).sort((a, b) => b.savedAt - a.savedAt)

/** Saves or updates a trip. Returns false when the phone's storage refused. */
export function saveTrip(trip: SavedTrip): boolean {
  const others = listTrips().filter((t) => t.id !== trip.id)
  return write(TRIPS_KEY, [trip, ...others].slice(0, MAX_SAVED_TRIPS))
}

export function deleteTrip(id: string) {
  write(TRIPS_KEY, listTrips().filter((t) => t.id !== id))
}

export const newTripId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
