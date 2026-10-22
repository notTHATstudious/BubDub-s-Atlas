import type { Destination } from '../data/types'
import { findDestination, findOrigin, type Origin } from '../engine/geo'
import { placeholderDestination } from '../engine/resolve'
import type { Notice, ResolvedTrip, TripInput } from '../engine/types'
import { elevation } from './elevation'
import { geocode, type GeoResult } from './geocode'
import { fetchAccess, fetchNearbyPlaces } from './places'
import { fetchWikipediaNearby } from './wikipedia'

// Hybrid lookup: the curated dataset first (better groupings, seasonal and
// road notes), then live OpenStreetMap / Wikipedia data for anywhere else.

export interface LiveResolved extends ResolvedTrip {
  /** Problems worth telling the person about, e.g. a lookup that failed. */
  notices: Notice[]
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export async function buildLiveDestination(geo: GeoResult): Promise<{ dest: Destination; notices: Notice[] }> {
  const notices: Notice[] = []
  const [placesRes, accessRes, altitude] = await Promise.allSettled([
    fetchNearbyPlaces(geo.coords),
    fetchAccess(geo.coords),
    elevation(geo.coords),
  ])
  let places = placesRes.status === 'fulfilled' ? placesRes.value.places : []
  const clusters = placesRes.status === 'fulfilled' ? placesRes.value.clusters : {}
  if (placesRes.status === 'rejected') {
    notices.push({ level: 'info', text: `The map service didn't respond, so places near ${geo.name} come from Wikipedia only.` })
  }
  if (places.length < 4) {
    try {
      const extra = await fetchWikipediaNearby(geo.coords, new Set(places.map((p) => p.name.toLowerCase())))
      for (const p of extra) clusters[p.cluster] = p.name
      places = [...places, ...extra]
    } catch {
      // Keep whatever we have; the person can add places themselves.
    }
  }
  if (places.length === 0) {
    notices.push({ level: 'info', text: `We couldn't find listed attractions near ${geo.name}. Add the places you want to see.` })
  }
  const highlights = places.filter((p) => p.priority >= 2).length
  const dest: Destination = {
    id: `live:${slug(geo.name)}-${geo.coords.lat.toFixed(2)}-${geo.coords.lon.toFixed(2)}`,
    name: geo.name,
    source: 'live',
    region: geo.label,
    coords: geo.coords,
    altitudeM: altitude.status === 'fulfilled' ? altitude.value : undefined,
    minNights: 1,
    idealNights: Math.min(4, Math.max(1, Math.round(highlights / 4))),
    bestMonths: [],
    access: accessRes.status === 'fulfilled' ? accessRes.value : {},
    clusters,
    places,
  }
  return { dest, notices }
}

async function resolveOrigin(query: string): Promise<Origin> {
  const known = findOrigin(query)
  if (known.coords) return known
  try {
    const [hit] = await geocode(query, 1)
    if (hit) {
      // The nearest airport makes flight search links exact; skip it if slow.
      const access = await fetchAccess(hit.coords).catch(() => undefined)
      return { id: `geo:${slug(hit.name)}`, name: hit.name, coords: hit.coords, airport: access?.airport?.code }
    }
  } catch {
    // Fall through to a name-only origin.
  }
  return known
}

/**
 * Resolves every name in the input. `picked` lets the form pass the exact
 * geocoder result the person chose from the suggestions, by stop name.
 */
export async function resolveTrip(input: TripInput, picked: Record<string, GeoResult> = {}): Promise<LiveResolved> {
  const notices: Notice[] = []
  const [origin, returnTo] = await Promise.all([
    resolveOrigin(input.from),
    input.returnTo ? resolveOrigin(input.returnTo) : Promise.resolve(undefined),
  ])
  const stops = await Promise.all(
    input.stops.map(async (name) => {
      const curated = findDestination(name)
      if (curated) return curated
      try {
        const geo = picked[name] ?? (await geocode(name, 1))[0]
        if (!geo) {
          notices.push({ level: 'caution', text: `We couldn't find "${name}" on the map. Check the spelling, or add places yourself.` })
          return placeholderDestination(name)
        }
        const live = await buildLiveDestination(geo)
        notices.push(...live.notices)
        return live.dest
      } catch {
        notices.push({ level: 'caution', text: `Couldn't look up "${name}" right now (no connection?). Add places yourself or try again.` })
        return placeholderDestination(name)
      }
    }),
  )
  return { origin, returnTo: returnTo ?? origin, stops, notices }
}
